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
from app.auth import hash_password, verify_password, create_access_token, get_current_user, require_role

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account.

    - candidate: no company required.
    - hr: requires company_name (creates new) or company_id (joins existing).
    - approver: requires company_id + approver_role.
    - interviewer: optionally joins existing company_id or defaults to platform company.
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
    elif payload.role == "interviewer":
        if payload.company_name:
            company = db.query(models.Company).filter(models.Company.name == payload.company_name).first()
            if not company:
                company = models.Company(name=payload.company_name)
                db.add(company)
                db.flush()
            company_id = company.id
        elif payload.company_id:
            company = db.query(models.Company).filter(models.Company.id == payload.company_id).first()
            if not company:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Company with id '{payload.company_id}' not found",
                )
            company_id = company.id
        else:
            first_co = db.query(models.Company).first()
            company_id = first_co.id if first_co else None

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
def get_me(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the authenticated user's profile and automatically links unlinked candidate records."""
    if current_user.role == "candidate":
        db.query(models.Candidate).filter(
            models.Candidate.email == current_user.email,
            models.Candidate.user_id == None,
        ).update({"user_id": current_user.id}, synchronize_session=False)
        db.commit()
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


# ---- Admin Multi-Role Governance Endpoints ----

@router.get("/governance/users", response_model=list[schemas.UserGovernanceOut])
def list_governance_users(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin-only: Retrieve registered users for multi-role governance inspection."""
    query = db.query(models.User)
    if current_user.company_id:
        query = query.filter(
            (models.User.company_id == current_user.company_id) | (models.User.role == "candidate")
        )
    users = query.order_by(models.User.created_at.desc()).all()
    return users


@router.post("/governance/users", response_model=schemas.UserGovernanceOut, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: schemas.AdminCreateUserRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Provision a new company employee (HR, Interviewer, Approver, Admin)
    with initial credentials and roles, automatically scoped to the company and logged in AccountLog.
    """
    existing = db.query(models.User).filter(models.User.email == payload.email.strip().lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email '{payload.email}' already exists",
        )

    target_company_id = payload.company_id or current_user.company_id
    if not target_company_id:
        first_co = db.query(models.Company).first()
        target_company_id = first_co.id if first_co else None

    approver_role = payload.approver_role
    if payload.role == "approver" and not approver_role:
        approver_role = "hiring_manager"

    new_user = models.User(
        email=payload.email.strip().lower(),
        name=payload.name.strip() if payload.name else None,
        password_hash=hash_password(payload.password),
        role=payload.role,
        secondary_roles=payload.secondary_roles or [],
        company_id=target_company_id,
        approver_role=approver_role if payload.role == "approver" else None,
    )
    db.add(new_user)
    db.flush()

    if target_company_id:
        log = models.AccountLog(
            company_id=target_company_id,
            admin_id=current_user.id,
            target_user_id=new_user.id,
            action="account_created",
            details={
                "email": new_user.email,
                "name": new_user.name,
                "role": new_user.role,
                "secondary_roles": new_user.secondary_roles,
                "approver_role": new_user.approver_role,
            },
        )
        db.add(log)

    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/governance/logs", response_model=list[schemas.AccountLogOut])
def get_account_logs(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin-only: Retrieve chronological account audit logs."""
    query = db.query(models.AccountLog)
    if current_user.company_id:
        query = query.filter(models.AccountLog.company_id == current_user.company_id)

    raw_logs = query.order_by(models.AccountLog.created_at.desc()).limit(200).all()

    output = []
    for l in raw_logs:
        admin_name = l.admin.name if l.admin else (l.admin.email if l.admin else "System Administrator")
        target_email = (
            l.target_user.email
            if l.target_user
            else (l.details.get("email") or l.details.get("target_email") if l.details else None)
        )
        output.append(
            schemas.AccountLogOut(
                id=l.id,
                company_id=l.company_id,
                admin_id=l.admin_id,
                admin_name=admin_name,
                target_user_id=l.target_user_id,
                target_user_email=target_email,
                action=l.action,
                details=l.details or {},
                created_at=l.created_at,
            )
        )
    return output


@router.post("/governance/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    payload: schemas.AdminResetPasswordRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin-only: Reset an employee password and record audit log."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found",
        )

    if current_user.company_id and user.company_id and user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset password for user in another organization",
        )

    user.password_hash = hash_password(payload.new_password)

    co_id = user.company_id or current_user.company_id
    if co_id:
        log = models.AccountLog(
            company_id=co_id,
            admin_id=current_user.id,
            target_user_id=user.id,
            action="password_reset",
            details={
                "target_email": user.email,
                "reset_by": current_user.email,
            },
        )
        db.add(log)

    db.commit()
    return {"message": "Password updated successfully", "user_id": user.id}


@router.patch("/governance/users/{user_id}/roles", response_model=schemas.UserGovernanceOut)
def update_user_roles_governance(
    user_id: str,
    payload: schemas.UserRoleGovernanceUpdate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Update a user's primary role, secondary roles, and approver tier
    to empower cross-functional governance and future role expansion.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found",
        )

    if payload.role is not None:
        user.role = payload.role
    if payload.secondary_roles is not None:
        user.secondary_roles = payload.secondary_roles
    if payload.approver_role is not None:
        user.approver_role = payload.approver_role

    co_id = user.company_id or current_user.company_id
    if co_id:
        log = models.AccountLog(
            company_id=co_id,
            admin_id=current_user.id,
            target_user_id=user.id,
            action="roles_updated",
            details={
                "target_email": user.email,
                "role": user.role,
                "secondary_roles": user.secondary_roles,
                "approver_role": user.approver_role,
            },
        )
        db.add(log)

    db.commit()
    db.refresh(user)
    return user


def seed_demo_users_if_empty(db: Session):
    """Ensure standard demo accounts exist for interactive evaluation."""
    try:
        company = (
            db.query(models.Company)
            .filter(models.Company.name.in_(["ReSumo Tech", "ReSumo Technologies"]))
            .first()
        )
        if not company:
            company = models.Company(name="ReSumo Tech")
            db.add(company)
            db.flush()

        default_users = [
            ("hr@resumo.ai", "Sarah Jenkins", "hr", company.id, None),
            ("candidate@resumo.ai", "Alex Rivera", "candidate", None, None),
            ("approver@resumo.ai", "David Chen", "approver", company.id, "hiring_manager"),
            ("director@resumo.ai", "Elena Rostova", "approver", company.id, "director"),
            ("vp@resumo.ai", "Marcus Vance", "approver", company.id, "vp"),
            ("admin@resumo.ai", "System Administrator", "admin", company.id, None),
            ("interviewer@resumo.ai", "Liam Vance", "interviewer", company.id, None),
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
                    secondary_roles=[],
                )
                db.add(user)
            else:
                if not user.name:
                    user.name = name
                if cid and user.company_id != cid:
                    user.company_id = cid
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Warning: Failed to seed demo users: {exc}")

