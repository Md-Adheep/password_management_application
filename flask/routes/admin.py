from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from functools import wraps
from extensions import db
from models import User, PasswordEntry

admin_bp = Blueprint('admin', __name__)


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get('role') != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        return fn(*args, **kwargs)
    return wrapper


@admin_bp.route('/users', methods=['GET'])
@admin_required
def get_all_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users]), 200


@admin_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    required = ['username', 'email', 'password']
    if not data or not all(data.get(f) for f in required):
        return jsonify({'message': 'username, email and password are required'}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Username already exists'}), 409
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'message': 'Email already exists'}), 409

    if len(data['password']) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400

    user = User(
        username=data['username'],
        email=data['email'],
        role=data.get('role', 'user')
    )
    user.set_password(data['password'])
    try:
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    return jsonify(user.to_dict()), 201


@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    data = request.get_json()
    if 'is_active' in data:
        user.is_active = data['is_active']
    if 'role' in data and data['role'] in ('admin', 'user'):
        user.role = data['role']
    if 'password' in data:
        if len(data['password']) < 8:
            return jsonify({'message': 'Password must be at least 8 characters'}), 400
        user.set_password(data['password'])

    db.session.commit()
    return jsonify(user.to_dict()), 200


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    identity = get_jwt_identity()
    if identity == user_id:
        return jsonify({'message': 'Cannot delete your own account'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User deleted successfully'}), 200


@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_stats():
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    total_passwords = PasswordEntry.query.count()
    admin_count = User.query.filter_by(role='admin').count()
    return jsonify({
        'total_users': total_users,
        'active_users': active_users,
        'inactive_users': total_users - active_users,
        'total_passwords': total_passwords,
        'admin_count': admin_count
    }), 200
