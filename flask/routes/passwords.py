from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import PasswordEntry
from utils.encryption import encrypt_password, decrypt_password
from utils.password_generator import generate_password

passwords_bp = Blueprint('passwords', __name__)


@passwords_bp.route('/', methods=['GET'])
@jwt_required()
def get_passwords():
    user_id = int(get_jwt_identity())
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()

    query = PasswordEntry.query.filter_by(user_id=user_id)
    if search:
        query = query.filter(PasswordEntry.title.ilike(f'%{search}%'))
    if category:
        query = query.filter_by(category=category)

    entries = query.order_by(PasswordEntry.updated_at.desc()).all()
    return jsonify([e.to_dict() for e in entries]), 200


@passwords_bp.route('/<int:entry_id>/decrypt', methods=['GET'])
@jwt_required()
def get_decrypted_password(entry_id):
    user_id = int(get_jwt_identity())
    entry = PasswordEntry.query.filter_by(id=entry_id, user_id=user_id).first()
    if not entry:
        return jsonify({'message': 'Entry not found'}), 404

    try:
        decrypted = decrypt_password(entry.encrypted_password)
    except Exception:
        return jsonify({'message': 'Failed to decrypt password'}), 500

    return jsonify({'password': decrypted}), 200


@passwords_bp.route('/', methods=['POST'])
@jwt_required()
def create_password():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data or not data.get('title') or not data.get('password'):
        return jsonify({'message': 'Title and password are required'}), 400

    entry = PasswordEntry(
        user_id=user_id,
        title=data['title'],
        username=data.get('username', ''),
        encrypted_password=encrypt_password(data['password']),
        url=data.get('url', ''),
        notes=data.get('notes', ''),
        category=data.get('category', 'General')
    )
    try:
        db.session.add(entry)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Database error: {str(e)}'}), 500
    return jsonify(entry.to_dict()), 201


@passwords_bp.route('/<int:entry_id>', methods=['PUT'])
@jwt_required()
def update_password(entry_id):
    user_id = int(get_jwt_identity())
    entry = PasswordEntry.query.filter_by(id=entry_id, user_id=user_id).first()
    if not entry:
        return jsonify({'message': 'Entry not found'}), 404

    data = request.get_json()
    if data.get('title'):
        entry.title = data['title']
    if data.get('username') is not None:
        entry.username = data['username']
    if data.get('password'):
        entry.encrypted_password = encrypt_password(data['password'])
    if data.get('url') is not None:
        entry.url = data['url']
    if data.get('notes') is not None:
        entry.notes = data['notes']
    if data.get('category'):
        entry.category = data['category']

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@passwords_bp.route('/<int:entry_id>', methods=['DELETE'])
@jwt_required()
def delete_password(entry_id):
    user_id = int(get_jwt_identity())
    entry = PasswordEntry.query.filter_by(id=entry_id, user_id=user_id).first()
    if not entry:
        return jsonify({'message': 'Entry not found'}), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully'}), 200


@passwords_bp.route('/generate', methods=['GET'])
@jwt_required()
def generate():
    length = int(request.args.get('length', 16))
    use_uppercase = request.args.get('uppercase', 'true').lower() == 'true'
    use_digits = request.args.get('digits', 'true').lower() == 'true'
    use_symbols = request.args.get('symbols', 'true').lower() == 'true'

    length = max(8, min(length, 64))
    password = generate_password(length, use_uppercase, use_digits, use_symbols)
    return jsonify({'password': password}), 200


@passwords_bp.route('/categories', methods=['GET'])
@jwt_required()
def get_categories():
    user_id = int(get_jwt_identity())
    rows = db.session.query(PasswordEntry.category).filter_by(
        user_id=user_id
    ).distinct().all()
    categories = [r[0] for r in rows]
    return jsonify(categories), 200
