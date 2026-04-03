import os
import sys
from flask import Flask, send_from_directory, jsonify
from config import Config
from extensions import db, bcrypt, jwt, cors
from routes.auth import auth_bp
from routes.passwords import passwords_bp
from routes.admin import admin_bp

sys.path.insert(0, os.path.dirname(__file__))


def create_app():
    # frontend is inside flask/frontend/
    app = Flask(__name__, static_folder='frontend', static_url_path='')
    app.config.from_object(Config)

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(passwords_bp, url_prefix='/api/passwords')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    # Global error handler — always return JSON
    @app.errorhandler(Exception)
    def handle_exception(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return jsonify({'message': e.description}), e.code
        app.logger.error(f'Unhandled exception: {e}', exc_info=True)
        return jsonify({'message': 'An internal server error occurred.'}), 500

    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'login.html')

    @app.route('/<path:path>')
    def static_files(path):
        return send_from_directory(app.static_folder, path)

    with app.app_context():
        db.create_all()
        _seed_admin()

    return app


def _seed_admin():
    from models import User
    if not User.query.filter_by(role='admin').first():
        admin = User(
            username='admin',
            email='admin@company.com',
            role='admin',
            is_active=True
        )
        admin.set_password('Admin@1234')
        db.session.add(admin)
        db.session.commit()
        print("Default admin created → username: admin | password: Admin@1234")


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5000)
