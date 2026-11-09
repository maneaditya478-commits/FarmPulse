"""Animal registration, identification, photos and lifecycle records."""

import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, page_result, require_roles
from app.core.errors import AppError
from app.models import (
    Animal,
    AnimalIdentifier,
    Breed,
    BreedingRecord,
    Farm,
    FeedRecord,
    HealthCase,
    MilkProduction,
    Species,
    User,
    Vaccination,
    VaccineCatalog,
    WaterRecord,
)
from app.schemas.domain import (
    AnimalCreate,
    AnimalOut,
    AnimalUpdate,
    BreedOut,
    BreedingRecordCreate,
    BreedingRecordOut,
    QRResponse,
    SpeciesOut,
)
from app.services.access import animal_query, get_animal_for_user, primary_farm
from app.services.storage import analyze_image_optional, save_animal_photo
from app.services.vaccination import ensure_animal_schedule

router = APIRouter(prefix="/animals", tags=["Animals"])


def _generate_tag(db: Session, species_code: str) -> str:
    for _ in range(12):
        candidate = f"{species_code[:3].upper()}-{uuid.uuid4().hex[:5].upper()}"
        if not db.scalar(select(Animal).where(Animal.tag_code == candidate)):
            return candidate
    raise AppError(500, "tag_generation_failed", "Could not generate a unique animal tag")


def _new_identifier(db: Session, animal: Animal) -> AnimalIdentifier:
    value = f"ALG-{animal.id.hex[:12].upper()}"
    identifier = AnimalIdentifier(
        animal_id=animal.id,
        identifier_type="qr",
        identifier_value=value,
        qr_payload=f"ALG|{animal.id}|{animal.tag_code}",
    )
    db.add(identifier)
    return identifier


@router.get("/species", response_model=list[SpeciesOut])
def list_species(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[Species]:
    return list(db.scalars(select(Species).where(Species.is_active.is_(True)).order_by(Species.name_en)).all())


@router.get("/breeds", response_model=list[BreedOut])
def list_breeds(
    species_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Breed]:
    stmt = select(Breed)
    if species_id:
        stmt = stmt.where(Breed.species_id == species_id)
    return list(db.scalars(stmt.order_by(Breed.name)).all())


@router.get("/qr/{code}", response_model=AnimalOut)
def lookup_qr(code: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Animal:
    identifier = db.scalar(select(AnimalIdentifier).where(AnimalIdentifier.identifier_value == code))
    if not identifier:
        raise AppError(status.HTTP_404_NOT_FOUND, "identifier_not_found", "No animal matches this identifier")
    animal = get_animal_for_user(db, user, identifier.animal_id)
    record_audit(db, actor=user, action="animal.qr_lookup", entity_type="animal", entity_id=animal.id)
    db.commit()
    return animal


@router.get("", response_model=dict)
def list_animals(
    q: str | None = None,
    species_id: uuid.UUID | None = None,
    farm_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = animal_query(db, user)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Animal.name.ilike(pattern), Animal.tag_code.ilike(pattern)))
    if species_id:
        stmt = stmt.where(Animal.species_id == species_id)
    if farm_id:
        stmt = stmt.where(Animal.farm_id == farm_id)
    if status_filter:
        stmt = stmt.where(Animal.status == status_filter)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.order_by(Animal.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    return page_result([AnimalOut.model_validate(item) for item in items], int(total), pagination)


@router.post("", response_model=AnimalOut, status_code=status.HTTP_201_CREATED)
def create_animal(
    payload: AnimalCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> Animal:
    farm = db.get(Farm, payload.farm_id) if payload.farm_id else primary_farm(db, user)
    if not farm:
        raise AppError(status.HTTP_400_BAD_REQUEST, "farm_required", "Create a farm before registering animals")
    if user.role != "admin" and farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot add animals to this farm")
    species = db.get(Species, payload.species_id)
    if not species:
        raise AppError(status.HTTP_404_NOT_FOUND, "species_not_found", "Species not found")
    if payload.breed_id:
        breed = db.get(Breed, payload.breed_id)
        if not breed or breed.species_id != species.id:
            raise AppError(status.HTTP_400_BAD_REQUEST, "invalid_breed", "Breed does not belong to the selected species")
    tag_code = payload.tag_code or _generate_tag(db, species.code)
    if db.scalar(select(Animal).where(Animal.tag_code == tag_code)):
        raise AppError(status.HTTP_409_CONFLICT, "tag_exists", "An animal with this tag code already exists")

    animal = Animal(
        farm_id=farm.id,
        species_id=species.id,
        breed_id=payload.breed_id,
        name=payload.name,
        tag_code=tag_code,
        sex=payload.sex,
        birth_date=payload.birth_date,
        weight_kg=payload.weight_kg,
        color=payload.color,
        photo_url=payload.photo_url,
        notes=payload.notes,
        is_sample=False,
    )
    db.add(animal)
    db.flush()
    _new_identifier(db, animal)
    ensure_animal_schedule(db, animal)
    record_audit(
        db,
        actor=user,
        action="animal.created",
        entity_type="animal",
        entity_id=animal.id,
        detail={"tag_code": tag_code, "species": species.code},
        request=request,
    )
    db.commit()
    return get_animal_for_user(db, user, animal.id)


@router.get("/{animal_id}", response_model=AnimalOut)
def get_animal(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Animal:
    return get_animal_for_user(db, user, animal_id)


@router.patch("/{animal_id}", response_model=AnimalOut)
def update_animal(
    animal_id: uuid.UUID,
    payload: AnimalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> Animal:
    animal = get_animal_for_user(db, user, animal_id)
    if user.role != "admin" and animal.farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot edit this animal")
    data = payload.model_dump(exclude_unset=True)
    if data.get("breed_id"):
        breed = db.get(Breed, data["breed_id"])
        if not breed or breed.species_id != animal.species_id:
            raise AppError(status.HTTP_400_BAD_REQUEST, "invalid_breed", "Breed does not belong to this species")
    for key, value in data.items():
        setattr(animal, key, value)
    record_audit(db, actor=user, action="animal.updated", entity_type="animal", entity_id=animal.id, detail={"fields": list(data)})
    db.commit()
    return get_animal_for_user(db, user, animal.id)


@router.delete("/{animal_id}")
def delete_animal(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> dict:
    animal = db.get(Animal, animal_id)
    if not animal:
        raise AppError(status.HTTP_404_NOT_FOUND, "animal_not_found", "Animal not found")
    record_audit(db, actor=user, action="animal.deleted", entity_type="animal", entity_id=animal.id)
    db.delete(animal)
    db.commit()
    return {"message": "Animal deleted"}


@router.post("/{animal_id}/photo", response_model=AnimalOut)
def upload_photo(
    animal_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> Animal:
    animal = get_animal_for_user(db, user, animal_id)
    if user.role != "admin" and animal.farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot edit this animal")
    url = save_animal_photo(file)
    animal.photo_url = url
    analysis = analyze_image_optional(url)
    record_audit(
        db,
        actor=user,
        action="animal.photo_uploaded",
        entity_type="animal",
        entity_id=animal.id,
        detail={"analysis": analysis},
    )
    db.commit()
    return get_animal_for_user(db, user, animal.id)


@router.post("/{animal_id}/qr", response_model=QRResponse)
def issue_qr(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> QRResponse:
    animal = get_animal_for_user(db, user, animal_id)
    identifier = db.scalar(
        select(AnimalIdentifier).where(
            AnimalIdentifier.animal_id == animal.id, AnimalIdentifier.identifier_type == "qr", AnimalIdentifier.is_active.is_(True)
        )
    )
    if not identifier:
        identifier = _new_identifier(db, animal)
        db.flush()
    record_audit(db, actor=user, action="animal.qr_issued", entity_type="animal_identifier", entity_id=identifier.id)
    db.commit()
    return QRResponse(
        animal_id=animal.id,
        identifier_value=identifier.identifier_value,
        qr_payload=identifier.qr_payload or identifier.identifier_value,
        issued_at=identifier.issued_at,
    )


@router.get("/{animal_id}/timeline")
def animal_timeline(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    animal = get_animal_for_user(db, user, animal_id)
    now = datetime.now(UTC)
    cases = db.scalars(
        select(HealthCase)
        .options(selectinload(HealthCase.observations), selectinload(HealthCase.visits))
        .where(HealthCase.animal_id == animal.id)
        .order_by(HealthCase.opened_at.desc())
        .limit(10)
    ).all()
    vaccinations = db.execute(
        select(Vaccination, VaccineCatalog)
        .join(VaccineCatalog, Vaccination.vaccine_id == VaccineCatalog.id)
        .where(Vaccination.animal_id == animal.id)
        .order_by(Vaccination.due_on.desc())
    ).all()
    feeds = db.scalars(
        select(FeedRecord).where(FeedRecord.animal_id == animal.id).order_by(FeedRecord.recorded_at.desc()).limit(10)
    ).all()
    water = db.scalars(
        select(WaterRecord).where(WaterRecord.animal_id == animal.id).order_by(WaterRecord.recorded_at.desc()).limit(5)
    ).all()
    milk = db.scalars(
        select(MilkProduction)
        .where(MilkProduction.animal_id == animal.id, MilkProduction.record_date >= date.today() - timedelta(days=30))
        .order_by(MilkProduction.record_date.desc())
    ).all()
    breeding = db.scalars(
        select(BreedingRecord).where(BreedingRecord.animal_id == animal.id).order_by(BreedingRecord.event_date.desc()).limit(10)
    ).all()
    return {
        "animal": AnimalOut.model_validate(animal).model_dump(mode="json"),
        "health_cases": [
            {
                "id": str(case.id),
                "case_code": case.case_code,
                "severity": case.severity,
                "status": case.status,
                "symptom_summary": case.symptom_summary,
                "opened_at": case.opened_at.isoformat(),
                "diagnosis_confirmed": bool(case.approved_at),
            }
            for case in cases
        ],
        "vaccinations": [
            {
                "id": str(row.id),
                "vaccine": vaccine.name,
                "disease": vaccine.disease,
                "administered_on": row.administered_on.isoformat() if row.administered_on else None,
                "due_on": row.due_on.isoformat(),
                "status": row.status,
                "source_reference": vaccine.source_reference,
            }
            for row, vaccine in vaccinations
        ],
        "feed_records": [
            {"recorded_at": row.recorded_at.isoformat(), "feed_type": row.feed_type, "quantity_kg": row.quantity_kg}
            for row in feeds
        ],
        "water_records": [
            {"recorded_at": row.recorded_at.isoformat(), "litres": row.litres, "source": row.source} for row in water
        ],
        "milk_records": [
            {"record_date": row.record_date.isoformat(), "litres": row.litres, "session": row.session} for row in milk
        ],
        "breeding_records": [BreedingRecordOut.model_validate(row).model_dump(mode="json") for row in breeding],
        "generated_at": now.isoformat(),
    }


@router.get("/{animal_id}/breeding", response_model=list[BreedingRecordOut])
def list_breeding(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BreedingRecord]:
    animal = get_animal_for_user(db, user, animal_id)
    return list(
        db.scalars(
            select(BreedingRecord).where(BreedingRecord.animal_id == animal.id).order_by(BreedingRecord.event_date.desc())
        ).all()
    )


@router.post("/{animal_id}/breeding", response_model=BreedingRecordOut, status_code=status.HTTP_201_CREATED)
def add_breeding_record(
    animal_id: uuid.UUID,
    payload: BreedingRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> BreedingRecord:
    animal = get_animal_for_user(db, user, animal_id)
    record = BreedingRecord(animal_id=animal.id, recorded_by=user.id, **payload.model_dump())
    db.add(record)
    record_audit(db, actor=user, action="breeding.recorded", entity_type="breeding_record", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record
