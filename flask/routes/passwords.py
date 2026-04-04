import csv
import io
from flask import Blueprint, request, jsonify, Response
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
        category=data.get('category', 'General'),
        is_favorite=bool(data.get('is_favorite', False))
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
    if 'is_favorite' in data:
        entry.is_favorite = bool(data['is_favorite'])

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


# ─── Export CSV ───────────────────────────────────────────────────────────────

@passwords_bp.route('/export', methods=['GET'])
@jwt_required()
def export_csv():
    user_id = int(get_jwt_identity())
    entries = PasswordEntry.query.filter_by(user_id=user_id).order_by(PasswordEntry.title).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name', 'username', 'password', 'url', 'notes', 'category', 'favorite'])
    for e in entries:
        try:
            pw = decrypt_password(e.encrypted_password)
        except Exception:
            pw = ''
        writer.writerow([
            e.title,
            e.username or '',
            pw,
            e.url or '',
            e.notes or '',
            e.category or 'General',
            '1' if e.is_favorite else '0'
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=corpvault_export.csv'}
    )


# ─── Import CSV ───────────────────────────────────────────────────────────────

@passwords_bp.route('/import', methods=['POST'])
@jwt_required()
def import_csv():
    user_id = int(get_jwt_identity())
    file = request.files.get('file')
    if not file:
        return jsonify({'message': 'No file provided'}), 400

    try:
        content = file.read().decode('utf-8-sig')  # utf-8-sig handles BOM from Excel/Bitwarden
        reader = csv.DictReader(io.StringIO(content))
        headers = [h.lower().strip() for h in (reader.fieldnames or [])]
    except Exception as e:
        return jsonify({'message': f'Could not read file: {str(e)}'}), 400

    # Detect Bitwarden format
    is_bitwarden = 'login_username' in headers or 'login_password' in headers

    imported = 0
    skipped = 0

    for row in reader:
        # Normalise keys to lowercase
        row = {k.lower().strip(): v for k, v in row.items()}

        if is_bitwarden:
            # Skip non-login types (cards, identities, etc.)
            if row.get('type', 'login') != 'login':
                skipped += 1
                continue
            title    = row.get('name', '').strip()
            username = row.get('login_username', '').strip()
            password = row.get('login_password', '').strip()
            url      = row.get('login_uri', '').strip()
            notes    = row.get('notes', '').strip()
            category = row.get('folder', 'General').strip() or 'General'
        else:
            title    = (row.get('name') or row.get('title', '')).strip()
            username = row.get('username', '').strip()
            password = row.get('password', '').strip()
            url      = (row.get('url') or row.get('login_uri', '')).strip()
            notes    = row.get('notes', '').strip()
            category = (row.get('category') or row.get('folder', 'General')).strip() or 'General'

        if not title or not password:
            skipped += 1
            continue

        entry = PasswordEntry(
            user_id=user_id,
            title=title,
            username=username,
            encrypted_password=encrypt_password(password),
            url=url,
            notes=notes,
            category=category,
            is_favorite=False
        )
        db.session.add(entry)
        imported += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Import failed: {str(e)}'}), 500

    return jsonify({'imported': imported, 'skipped': skipped}), 200
