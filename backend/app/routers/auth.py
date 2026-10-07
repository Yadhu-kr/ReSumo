"""
Auth Router: registration, login, and profile endpoints.

POST /auth/register — Create a new user account.
POST /auth/login    — Authenticate and receive a JWT access token.
GET  /auth/me       — Retrieve the current user's profile.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account.

    - candidate: no company required.
    - hr: requires company_name (creates new) or company_id (joins existing).
    - approver: requires company_id + approver_role.
    - admin: self-registration allowed.
    """
    # Check duplicate email
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    company_id = None

    if payload.role in ("hr", "approver"):
        # HR/approver must be associated with a company
        if payload.company_id:
            company = db.query(models.Company).filter(models.Company.id == payload.company_id).first()
            if not company:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Company with id '{payload.company_id}' not found",
                )
            company_id = company.id
        elif payload.company_name and payload.role == "hr":
            # HR can create a new company
            company = models.Company(name=payload.company_name)
            db.add(company)
            db.flush()  # get company.id before creating user
            company_id = company.id
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="HR role requires company_name (to create) or company_id (to join). "
                       "Approver role requires company_id.",
            )

        # Approver must specify approver_role
        if payload.role == "approver" and not payload.approver_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Approver role requires approver_role (hiring_manager/director/vp/ceo)",
            )

    user = models.User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        company_id=company_id,
        approver_role=payload.approver_role if payload.role == "approver" else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    """Authenticate with email and password. Returns a JWT access token."""
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": user.id, "role": user.role})
    return schemas.TokenResponse(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Returns the authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_me(
    payload: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user profile information. Self-service role changes are disallowed to preserve RBAC integrity."""
    if payload.role is not None or payload.approver_role is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-service role changes are not allowed",
        )

    if payload.name is not None:
        current_user.name = payload.name.strip() or None

    db.commit()
    db.refresh(current_user)
    return current_user


def seed_demo_users_if_empty(db: Session):
    """Ensure standard demo accounts exist for interactive evaluation."""
    try:
        company = db.query(models.Company).filter(models.Company.name == "ReSumo Technologies").first()
        if not company:
            company = models.Company(name="ReSumo Technologies")
            db.add(company)
            db.flush()

        default_users = [
            ("hr@resumo.ai", "Sarah Jenkins", "hr", company.id, None),
            ("candidate@resumo.ai", "Alex Rivera", "candidate", None, None),
            ("approver@resumo.ai", "David Chen", "approver", company.id, "hiring_manager"),
            ("director@resumo.ai", "Elena Rostova", "approver", company.id, "director"),
            ("vp@resumo.ai", "Marcus Vance", "approver", company.id, "vp"),
            ("admin@resumo.ai", "System Administrator", "admin", company.id, None),
        ]

        for email, name, role, cid, app_role in default_users:
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                user = models.User(
                    email=email,
                    name=name,
                    password_hash=hash_password("Password123!"),
                    role=role,
                    company_id=cid,
                    approver_role=app_role,
                )
                db.add(user)
            elif not user.name:
                user.name = name
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Warning: Failed to seed demo users: {exc}")

