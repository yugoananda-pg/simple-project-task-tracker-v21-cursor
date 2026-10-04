const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return "Please enter your email address.";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return "Please enter your password.";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Please enter your name.";
  }
  if (trimmed.length > 100) {
    return "Name must be 100 characters or fewer.";
  }
  return null;
}

export function validateConfirmPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (!confirmPassword) {
    return "Please confirm your password.";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

export function mapAuthError(message: string): string {
  const normalised = message.toLowerCase();

  if (normalised.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (normalised.includes("user already registered")) {
    return "This email address is already registered. Sign in if this is your account, or use Forgot password if you need a temporary password.";
  }
  if (normalised.includes("password")) {
    return "Please check your password and try again.";
  }
  if (normalised.includes("email")) {
    return "Please check your email address and try again.";
  }
  if (normalised.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "Something went wrong. Please try again.";
}
