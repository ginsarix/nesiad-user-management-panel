// better-auth error codes shown on the auth screens, in Turkish
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-posta veya şifre hatalı.",
  EMAIL_NOT_VERIFIED:
    "E-posta adresiniz henüz doğrulanmamış. Yeni bir doğrulama bağlantısı gönderdik, e-postanızı kontrol edin.",
  BANNED_USER: "Hesabınız devre dışı bırakılmış.",
  INVALID_PASSWORD: "Mevcut şifre hatalı.",
  INVALID_TOKEN:
    "Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeni bir bağlantı isteyin.",
  PASSWORD_TOO_SHORT: "Şifre çok kısa.",
  PASSWORD_TOO_LONG: "Şifre çok uzun.",
  USER_ALREADY_EXISTS: "Bu e-posta adresiyle bir kullanıcı zaten var.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Bu e-posta adresiyle bir kullanıcı zaten var.",
  YOU_CANNOT_BAN_YOURSELF: "Kendi hesabınızı devre dışı bırakamazsınız.",
  YOU_CANNOT_REMOVE_YOURSELF: "Kendi hesabınızı silemezsiniz.",
  INITIAL_PASSWORD_NOT_ALLOWED:
    "Bu ekran yalnızca e-posta bağlantısıyla girişten hemen sonra, bir kez kullanılabilir. Şifrenizi menüdeki “Şifre değiştir” ile değiştirebilirsiniz.",
  LOGIN_CODE_RESEND_TOO_SOON: "Yeni kod istemek için bir dakika bekleyin.",
  LOGIN_CODE_NOT_SENT: "Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Çok fazla hatalı kod girildi. 15 dakika sonra tekrar deneyin.",
  INVALID_CODE: "Kod hatalı.",
  OTP_HAS_EXPIRED: "Kodun süresi doldu. Yeni kod isteyin.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Bu kod için deneme hakkınız doldu. Yeni kod isteyin.",
  INVALID_TWO_FACTOR_COOKIE:
    "Giriş süresi doldu. Lütfen e-posta ve şifrenizle yeniden giriş yapın.",
};

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
) {
  // codes first: some 429s (resend cooldown, account lock) say more
  const message = error?.code && messages[error.code];
  if (message) return message;
  if (error?.status === 429) {
    return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
  }
  if (error?.code?.startsWith("YOU_ARE_NOT_ALLOWED_")) {
    return "Bu işlem için yetkiniz yok.";
  }
  return "Bir hata oluştu. Lütfen tekrar deneyin.";
}
