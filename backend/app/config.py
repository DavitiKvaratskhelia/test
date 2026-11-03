from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "CHANGE-ME-dev-only"
    jwt_ttl_minutes: int = 60
    environment: str = "dev"  # dev | test | prod

    # GPS freshness thresholds (seconds since last fix)
    gps_realtime_max_age_s: int = 60
    gps_delayed_max_age_s: int = 300
    gps_max_future_skew_s: int = 120
    gps_max_accuracy_m: float = 200.0
    gps_max_speed_ms: float = 60.0  # ~216 km/h, reject beyond

    # Weather bonus fallback when evidence is missing: deny | manual_review | allow_forecast
    weather_missing_evidence_policy: str = "manual_review"

    default_city: str = "Tbilisi"
    cors_origins: list[str] = ["http://localhost:3000"]
    cors_origin_regex: str | None = None

    # DEMO_MODE: ephemeral SQLite + SIMULATED data, for serverless demos only. Data resets on cold start.
    demo_mode: bool = False
    demo_user_email: str | None = None
    demo_user_password: str | None = None


settings = Settings()


def assert_prod_safe() -> None:
    if settings.environment == "prod" and settings.jwt_secret.startswith("CHANGE-ME"):
        raise RuntimeError("JWT_SECRET must be set in production")
