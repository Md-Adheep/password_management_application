import secrets
import string


def generate_password(length=16, use_uppercase=True, use_digits=True, use_symbols=True):
    chars = string.ascii_lowercase
    required = [secrets.choice(string.ascii_lowercase)]

    if use_uppercase:
        chars += string.ascii_uppercase
        required.append(secrets.choice(string.ascii_uppercase))

    if use_digits:
        chars += string.digits
        required.append(secrets.choice(string.digits))

    if use_symbols:
        symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?"
        chars += symbols
        required.append(secrets.choice(symbols))

    remaining_length = length - len(required)
    password_chars = required + [secrets.choice(chars) for _ in range(remaining_length)]
    secrets.SystemRandom().shuffle(password_chars)
    return ''.join(password_chars)
