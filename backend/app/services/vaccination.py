"""Vaccination scheduling based on the verified species catalogue."""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Animal, Notification, Vaccination, VaccineCatalog
from app.services.notifications import create_notification


def add_days(base: date, days: int | None) -> date | None:
    if days is None:
        return None
    return base + timedelta(days=days)


def effective_status(due_on: date, administered_on: date | None) -> str:
    if administered_on:
        return "given"
    today = date.today()
    if due_on < today:
        return "overdue"
    if due_on <= today + timedelta(days=30):
        return "due"
    return "scheduled"


def ensure_animal_schedule(db: Session, animal: Animal) -> list[Vaccination]:
    """Create missing vaccination rows for the animal's species (idempotent)."""
    catalog = db.scalars(
        select(VaccineCatalog).where(VaccineCatalog.species_id == animal.species_id, VaccineCatalog.is_verified.is_(True))
    ).all()
    existing = {
        row.vaccine_id: row
        for row in db.scalars(select(Vaccination).where(Vaccination.animal_id == animal.id)).all()
    }
    birth = animal.birth_date or date.today()
    created: list[Vaccination] = []
    for vaccine in catalog:
        if vaccine.id in existing:
            row = existing[vaccine.id]
            row.status = effective_status(row.due_on, row.administered_on)
            continue
        due_on = birth + timedelta(days=vaccine.age_weeks * 7)
        row = Vaccination(
            animal_id=animal.id,
            vaccine_id=vaccine.id,
            due_on=due_on,
            status=effective_status(due_on, None),
            is_sample=animal.is_sample,
        )
        db.add(row)
        created.append(row)
    return created


def refresh_statuses(db: Session, animal_ids: list[uuid.UUID] | None = None) -> None:
    stmt = select(Vaccination)
    if animal_ids is not None:
        stmt = stmt.where(Vaccination.animal_id.in_(animal_ids))
    for row in db.scalars(stmt).all():
        new_status = effective_status(row.due_on, row.administered_on)
        if row.status != new_status:
            row.status = new_status


def schedule_items(db: Session, animal_ids: list[uuid.UUID], within_days: int = 30) -> list[dict]:
    if not animal_ids:
        return []
    refresh_statuses(db, animal_ids)
    rows = db.execute(
        select(Vaccination, VaccineCatalog, Animal)
        .join(VaccineCatalog, Vaccination.vaccine_id == VaccineCatalog.id)
        .join(Animal, Vaccination.animal_id == Animal.id)
        .where(Vaccination.animal_id.in_(animal_ids))
        .order_by(Vaccination.due_on)
    ).all()
    today = date.today()
    items: list[dict] = []
    for vaccination, vaccine, animal in rows:
        status = effective_status(vaccination.due_on, vaccination.administered_on)
        if status == "given":
            continue
        days_until = (vaccination.due_on - today).days
        if status == "overdue" or days_until <= within_days:
            items.append(
                {
                    "animal_id": animal.id,
                    "animal_name": animal.name,
                    "vaccine_id": vaccine.id,
                    "vaccine_name": vaccine.name,
                    "disease": vaccine.disease,
                    "due_on": vaccination.due_on,
                    "status": status,
                    "days_until": days_until,
                    "source_reference": vaccine.source_reference,
                    "note": "Verify with a veterinarian before administration",
                }
            )
    return items


def mark_given(
    db: Session,
    vaccination: Vaccination,
    *,
    administered_on: date | None,
    batch_no: str | None,
    administered_by: str | None,
    certificate_ref: str | None = None,
) -> Vaccination:
    given_on = administered_on or date.today()
    previous_date = vaccination.administered_on
    previous_batch = vaccination.batch_no
    vaccination.administered_on = given_on
    vaccination.batch_no = batch_no
    vaccination.administered_by = administered_by
    vaccination.certificate_ref = certificate_ref
    if vaccination.verified_by and (previous_date != given_on or previous_batch != batch_no):
        # Attestation covers the recorded date/batch; any edit invalidates it.
        vaccination.verified_by = None
    vaccine = db.get(VaccineCatalog, vaccination.vaccine_id)
    booster = vaccine.booster_days if vaccine else None
    if booster:
        # Booster scheduled: keep status so schedule_items picks it up as due/overdue
        next_due = given_on + timedelta(days=booster)
        vaccination.due_on = next_due
        vaccination.notes = (
            (vaccination.notes or "") + f" Next booster scheduled {next_due.isoformat()} per verified protocol."
        ).strip()
        vaccination.status = "due"
    else:
        # No booster: final dose, mark as given
        vaccination.status = "given"
    return vaccination


def create_vaccination_reminders(db: Session, animal_ids: list[uuid.UUID]) -> int:
    """Create de-duplicated in-app reminders for due/overdue vaccinations."""
    items = schedule_items(db, animal_ids, within_days=7)
    created = 0
    for item in items:
        animal = db.get(Animal, item["animal_id"])
        if not animal:
            continue
        farmer_id = animal.farm.owner_id if animal.farm else None
        if not farmer_id:
            continue
        existing = db.scalar(
            select(Notification).where(
                Notification.user_id == farmer_id,
                Notification.type == "vaccination_reminder",
                Notification.related_id == str(item["vaccine_id"]),
                Notification.status.in_(("pending", "sent")),
                Notification.created_at >= datetime.now(UTC) - timedelta(days=1),
            )
        )
        if existing:
            continue
        lang = animal.farm.owner.language if animal.farm and animal.farm.owner else "en"
        status_word = {"overdue": "overdue", "due": "due soon"}.get(item["status"], "scheduled")
        title = {"en": "Vaccination reminder", "hi": "टीकाकरण अनुस्मारक", "mr": "लसीकरण स्मरणपत्र"}.get(lang, "Vaccination reminder")
        body_en = f"{animal.name}: {item['vaccine_name']} is {status_word} on {item['due_on']}. Source: {item['source_reference']}"
        body = {
            "hi": f"{animal.name}: {item['vaccine_name']} की तिथि {item['due_on']} है ({'विलंबित' if item['status'] == 'overdue' else 'जल्द देय'})। स्रोत: {item['source_reference']}",
            "mr": f"{animal.name}: {item['vaccine_name']} ची तारीख {item['due_on']} आहे ({'रखडलेली' if item['status'] == 'overdue' else 'लवकर देय'})। स्रोत: {item['source_reference']}",
        }.get(lang, body_en)
        create_notification(
            db,
            user_id=farmer_id,
            title=title,
            body=body,
            type="vaccination_reminder",
            language=lang,
            related_type="vaccination",
            related_id=item["vaccine_id"],
        )
        created += 1
    return created
