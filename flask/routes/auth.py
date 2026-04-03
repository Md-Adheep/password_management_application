from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from extensions import db
from models import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Username and password required'}), 400

    user = User.query.filter_by(username=data['username']).first()
    if not user or not user.check_password(data['password']):
        return jsonify({'message': 'Invalid credentials'}), 401

    if not user.is_active:
        return jsonify({'message': 'Account is deactivated. Contact admin.'}), 403

    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    token = create_access_token(
        identity=user.id,
        additional_claims={'role': user.role}
    )
    return jsonify({
        'token': token,
        'user': user.to_dict()
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_me():
    identity = get_jwt_identity()
    user = User.query.get(identity)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    return jsonify(user.to_dict()), 200


@auth_bp.route('/change-password', methods=['PUT'])
@jwt_required()
def change_password():
    identity = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('current_password') or not data.get('new_password'):
        return jsonify({'message': 'Current and new password required'}), 400

    user = User.query.get(identity)
    if not user.check_password(data['current_password']):
        return jsonify({'message': 'Current password is incorrect'}), 400

    if len(data['new_password']) < 8:
        return jsonify({'message': 'New password must be at least 8 characters'}), 400

    user.set_password(data['new_password'])
    db.session.commit()
    return jsonify({'message': 'Password changed successfully'}), 200
