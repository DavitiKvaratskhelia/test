"""Small geometry helpers. Polygons are rings of [lon, lat] (GeoJSON order). In production, heavy spatial
queries should use PostGIS; this is for per-order zone assignment and validation."""


def valid_ring(ring) -> bool:
    if not isinstance(ring, list) or len(ring) < 3:
        return False
    for pt in ring:
        if not (isinstance(pt, (list, tuple)) and len(pt) == 2 and all(isinstance(v, (int, float)) for v in pt)):
            return False
        lon, lat = pt
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return False
    return True


def point_in_polygon(lat: float, lon: float, ring: list) -> bool:
    """Ray casting. Points exactly on an edge may fall either way."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside
