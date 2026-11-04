from .conftest import login


def test_login_and_me(client, admin):
    assert client.get("/auth/me", headers=admin).json()["role"] == "owner"


def test_bad_password(client):
    assert client.post("/auth/login", json={"email": "admin@zoommer.local", "password": "x"}).status_code == 401


def test_unauthenticated(client):
    assert client.get("/orders").status_code == 401


def test_permissions_matrix(client):
    courier = login(client, "courier@z.local")
    finance = login(client, "finance_manager@z.local")
    dispatcher = login(client, "dispatcher@z.local")
    assert client.get("/orders", headers=courier).status_code == 403          # courier cannot list orders
    assert client.get("/fleet/couriers", headers=finance).status_code == 403   # finance cannot see fleet
    assert client.get("/orders", headers=dispatcher).status_code == 200
    assert client.post("/fleet/vehicles", headers=dispatcher,
                       json={"plate": "AA-1", "type": "car"}).status_code == 403
