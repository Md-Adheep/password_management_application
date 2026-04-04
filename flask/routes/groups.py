from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from extensions import db
from models import Group, GroupMember, GroupPassword, User
from utils.encryption import encrypt_password, decrypt_password

groups_bp = Blueprint('groups', __name__)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_identity():
    """Return (user_id: int, role: str) from current JWT."""
    return int(get_jwt_identity()), get_jwt().get('role', 'user')

def _is_admin_role(role):
    return role == 'admin'

def _membership(group_id, user_id):
    return GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()

def _can_manage(group_id, user_id, role):
    """Admin or group manager."""
    if _is_admin_role(role):
        return True
    m = _membership(group_id, user_id)
    return m and m.role == 'manager'


# ─── Groups ───────────────────────────────────────────────────────────────────

@groups_bp.route('/', methods=['GET'])
@jwt_required()
def list_groups():
    user_id, role = _get_identity()
    if _is_admin_role(role):
        groups = Group.query.order_by(Group.created_at.desc()).all()
    else:
        memberships = GroupMember.query.filter_by(user_id=user_id).all()
        ids = [m.group_id for m in memberships]
        groups = Group.query.filter(Group.id.in_(ids)).order_by(Group.name).all()
    return jsonify([g.to_dict() for g in groups]), 200


@groups_bp.route('/', methods=['POST'])
@jwt_required()
def create_group():
    user_id, role = _get_identity()
    if not _is_admin_role(role):
        return jsonify({'message': 'Admin access required'}), 403

    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'message': 'Group name is required'}), 400
    if Group.query.filter_by(name=data['name']).first():
        return jsonify({'message': 'Group name already exists'}), 409

    group = Group(
        name=data['name'],
        description=data.get('description', ''),
        created_by=user_id
    )
    try:
        db.session.add(group)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    return jsonify(group.to_dict()), 201


@groups_bp.route('/<int:group_id>', methods=['PUT'])
@jwt_required()
def update_group(group_id):
    user_id, role = _get_identity()
    if not _can_manage(group_id, user_id, role):
        return jsonify({'message': 'Admin or manager access required'}), 403

    group = Group.query.get(group_id)
    if not group:
        return jsonify({'message': 'Group not found'}), 404

    data = request.get_json()
    if data.get('name'):
        if Group.query.filter(Group.name == data['name'], Group.id != group_id).first():
            return jsonify({'message': 'Group name already exists'}), 409
        group.name = data['name']
    if 'description' in data:
        group.description = data['description']

    db.session.commit()
    return jsonify(group.to_dict()), 200


@groups_bp.route('/<int:group_id>', methods=['DELETE'])
@jwt_required()
def delete_group(group_id):
    user_id, role = _get_identity()
    if not _is_admin_role(role):
        return jsonify({'message': 'Admin access required'}), 403

    group = Group.query.get(group_id)
    if not group:
        return jsonify({'message': 'Group not found'}), 404

    db.session.delete(group)
    db.session.commit()
    return jsonify({'message': 'Group deleted'}), 200


# ─── Members ─────────────────────────────────────────────────────────────────

@groups_bp.route('/<int:group_id>/members', methods=['GET'])
@jwt_required()
def list_members(group_id):
    user_id, role = _get_identity()
    if not _is_admin_role(role) and not _membership(group_id, user_id):
        return jsonify({'message': 'Access denied'}), 403

    if not Group.query.get(group_id):
        return jsonify({'message': 'Group not found'}), 404

    members = GroupMember.query.filter_by(group_id=group_id).all()
    return jsonify([m.to_dict() for m in members]), 200


@groups_bp.route('/<int:group_id>/members', methods=['POST'])
@jwt_required()
def add_member(group_id):
    user_id, role = _get_identity()
    if not _can_manage(group_id, user_id, role):
        return jsonify({'message': 'Admin or manager access required'}), 403

    if not Group.query.get(group_id):
        return jsonify({'message': 'Group not found'}), 404

    data = request.get_json()
    target_user_id = data.get('user_id')
    member_role = data.get('role', 'member')

    if not target_user_id:
        return jsonify({'message': 'user_id is required'}), 400
    if member_role not in ('member', 'manager'):
        return jsonify({'message': 'role must be member or manager'}), 400
    if not User.query.get(target_user_id):
        return jsonify({'message': 'User not found'}), 404
    if _membership(group_id, target_user_id):
        return jsonify({'message': 'User already in group'}), 409

    member = GroupMember(group_id=group_id, user_id=target_user_id, role=member_role)
    try:
        db.session.add(member)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    return jsonify(member.to_dict()), 201


@groups_bp.route('/<int:group_id>/members/<int:target_user_id>', methods=['DELETE'])
@jwt_required()
def remove_member(group_id, target_user_id):
    user_id, role = _get_identity()
    if not _can_manage(group_id, user_id, role):
        return jsonify({'message': 'Admin or manager access required'}), 403

    member = GroupMember.query.filter_by(group_id=group_id, user_id=target_user_id).first()
    if not member:
        return jsonify({'message': 'Member not found'}), 404

    db.session.delete(member)
    db.session.commit()
    return jsonify({'message': 'Member removed'}), 200


# ─── Group Passwords ──────────────────────────────────────────────────────────

@groups_bp.route('/<int:group_id>/passwords', methods=['GET'])
@jwt_required()
def list_group_passwords(group_id):
    user_id, role = _get_identity()
    if not _is_admin_role(role) and not _membership(group_id, user_id):
        return jsonify({'message': 'Access denied'}), 403

    pwds = GroupPassword.query.filter_by(group_id=group_id)\
               .order_by(GroupPassword.updated_at.desc()).all()
    return jsonify([p.to_dict() for p in pwds]), 200


@groups_bp.route('/<int:group_id>/passwords', methods=['POST'])
@jwt_required()
def add_group_password(group_id):
    user_id, role = _get_identity()
    if not _is_admin_role(role) and not _membership(group_id, user_id):
        return jsonify({'message': 'Access denied'}), 403

    data = request.get_json()
    if not data or not data.get('title') or not data.get('password'):
        return jsonify({'message': 'Title and password are required'}), 400

    pwd = GroupPassword(
        group_id=group_id,
        added_by=user_id,
        title=data['title'],
        username=data.get('username', ''),
        encrypted_password=encrypt_password(data['password']),
        url=data.get('url', ''),
        notes=data.get('notes', ''),
        category=data.get('category', 'General')
    )
    try:
        db.session.add(pwd)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    return jsonify(pwd.to_dict()), 201


@groups_bp.route('/<int:group_id>/passwords/<int:pwd_id>/decrypt', methods=['GET'])
@jwt_required()
def decrypt_group_password(group_id, pwd_id):
    user_id, role = _get_identity()
    if not _is_admin_role(role) and not _membership(group_id, user_id):
        return jsonify({'message': 'Access denied'}), 403

    pwd = GroupPassword.query.filter_by(id=pwd_id, group_id=group_id).first()
    if not pwd:
        return jsonify({'message': 'Password not found'}), 404

    try:
        return jsonify({'password': decrypt_password(pwd.encrypted_password)}), 200
    except Exception:
        return jsonify({'message': 'Failed to decrypt password'}), 500


@groups_bp.route('/<int:group_id>/passwords/<int:pwd_id>', methods=['DELETE'])
@jwt_required()
def delete_group_password(group_id, pwd_id):
    user_id, role = _get_identity()
    pwd = GroupPassword.query.filter_by(id=pwd_id, group_id=group_id).first()
    if not pwd:
        return jsonify({'message': 'Password not found'}), 404

    m = _membership(group_id, user_id)
    can_delete = _is_admin_role(role) or pwd.added_by == user_id or (m and m.role == 'manager')
    if not can_delete:
        return jsonify({'message': 'Only the creator or a manager can delete this'}), 403

    db.session.delete(pwd)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200
