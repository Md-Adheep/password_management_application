from datetime import datetime, timezone
from extensions import db, bcrypt


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum('admin', 'user'), default='user', nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = db.Column(db.DateTime, nullable=True)

    passwords = db.relationship('PasswordEntry', backref='owner', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None
        }


class PasswordEntry(db.Model):
    __tablename__ = 'password_entries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    username = db.Column(db.String(150), nullable=True)
    encrypted_password = db.Column(db.Text, nullable=False)
    url = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(80), default='General')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self, decrypted_password=None):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'username': self.username,
            'password': decrypted_password,
            'url': self.url,
            'notes': self.notes,
            'category': self.category,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


# ─── Groups / Teams ───────────────────────────────────────────────────────────

class Group(db.Model):
    __tablename__ = 'groups'

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    created_by  = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    members   = db.relationship('GroupMember',   backref='group', lazy=True, cascade='all, delete-orphan')
    passwords = db.relationship('GroupPassword', backref='group', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':           self.id,
            'name':         self.name,
            'description':  self.description or '',
            'created_by':   self.created_by,
            'created_at':   self.created_at.isoformat(),
            'member_count': len(self.members)
        }


class GroupMember(db.Model):
    __tablename__ = 'group_members'
    __table_args__ = (db.UniqueConstraint('group_id', 'user_id'),)

    id        = db.Column(db.Integer, primary_key=True)
    group_id  = db.Column(db.Integer, db.ForeignKey('groups.id'),  nullable=False)
    user_id   = db.Column(db.Integer, db.ForeignKey('users.id'),   nullable=False)
    role      = db.Column(db.Enum('member', 'manager'), default='member', nullable=False)
    joined_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref='group_memberships')

    def to_dict(self):
        return {
            'id':        self.id,
            'group_id':  self.group_id,
            'user_id':   self.user_id,
            'username':  self.user.username if self.user else None,
            'email':     self.user.email    if self.user else None,
            'role':      self.role,
            'joined_at': self.joined_at.isoformat()
        }


class GroupPassword(db.Model):
    __tablename__ = 'group_passwords'

    id                 = db.Column(db.Integer, primary_key=True)
    group_id           = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False)
    added_by           = db.Column(db.Integer, db.ForeignKey('users.id'),  nullable=False)
    title              = db.Column(db.String(150), nullable=False)
    username           = db.Column(db.String(150), nullable=True)
    encrypted_password = db.Column(db.Text, nullable=False)
    url                = db.Column(db.String(500), nullable=True)
    notes              = db.Column(db.Text, nullable=True)
    category           = db.Column(db.String(80), default='General')
    created_at         = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at         = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                   onupdate=lambda: datetime.now(timezone.utc))

    creator = db.relationship('User', foreign_keys=[added_by])

    def to_dict(self, decrypted_password=None):
        return {
            'id':         self.id,
            'group_id':   self.group_id,
            'added_by':   self.added_by,
            'added_by_username': self.creator.username if self.creator else None,
            'title':      self.title,
            'username':   self.username,
            'password':   decrypted_password,
            'url':        self.url,
            'notes':      self.notes,
            'category':   self.category,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
