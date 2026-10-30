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
  INITIAL_PASSWORD_NOT_ALLOWED:
    "Bu ekran yalnızca e-posta bağlantısıyla girişten hemen sonra, bir kez kullanılabilir. Şifrenizi menüdeki “Şifre değiştir” ile değiştirebilirsiniz.",
};

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
) {
  if (error?.status === 429) {
    return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
  }
  return (
    (error?.code && messages[error.code]) ??
    "Bir hata oluştu. Lütfen tekrar deneyin."
  );
}
