def test_market_rows_are_sourced_and_labelled(client, farmer_headers):
    response = client.get("/api/v1/market/prices", headers=farmer_headers)
    assert response.status_code == 200
    rows = response.json()
    assert rows
    for row in rows:
        assert row["source"]
        assert row["observed_on"]
        assert row["unit"]
        assert row["is_demo"] is True


def test_market_trends_require_district_and_category(client, farmer_headers):
    missing = client.get("/api/v1/market/trends", headers=farmer_headers)
    assert missing.status_code == 422
    response = client.get("/api/v1/market/trends?district=Pune&category=milk", headers=farmer_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["series"]
    assert body["sources"]


def test_finance_exposes_assumptions_and_estimate(client, farmer_headers):
    response = client.get("/api/v1/finance/summary", headers=farmer_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["milk_revenue"] > 0
    assert body["feed_expense"] > 0
    assert body["estimated_loss"] >= 0
    assert body["assumptions"]
    assert "not" in body["attribution"].lower()


def test_analytics_overview(client, farmer_headers):
    response = client.get("/api/v1/analytics/overview", headers=farmer_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_animals"] == 20
    assert isinstance(body["species_distribution"], list)
    assert body["milk_litres_30d"] > 0
    assert body["is_sample"] is True
