import type { AuditEntityTypeFilter } from "./audit-filters";

export const ENTITY_TYPE_LABELS: Record<AuditEntityTypeFilter, string> = {
  member: "Üyeler",
  representative: "Yetkililer",
  sector: "Sektörler",
  panel_user: "Panel kullanıcıları",
  sms: "SMS",
  auth: "Oturum açma",
};

const RECORD_ACTIONS: Record<string, Record<string, string>> = {
  member: {
    create: "Üye eklendi",
    update: "Üye güncellendi",
    delete: "Üye silindi",
  },
  representative: {
    create: "Yetkili eklendi",
    update: "Yetkili güncellendi",
    delete: "Yetkili silindi",
  },
  sector: {
    create: "Sektör eklendi",
    update: "Sektör adı değiştirildi",
    delete: "Sektör silindi",
  },
  panel_user: {
    create: "Panel kullanıcısı eklendi",
    update: "Panel kullanıcısının adı değiştirildi",
    delete: "Panel kullanıcısı silindi",
    password_set: "Panel kullanıcısına şifre belirlendi",
    disable: "Panel kullanıcısı devre dışı bırakıldı",
    enable: "Panel kullanıcısı etkinleştirildi",
    verification_email: "Doğrulama e-postası gönderildi",
  },
  sms: {
    send: "SMS gönderildi",
    auto_send: "Kutlama SMS'i gönderildi",
    auto_send_failed: "Kutlama SMS'i gönderilemedi",
    auto_send_unknown: "Kutlama SMS'i: NetGSM yanıt vermedi",
    settings_update: "SMS ayarları değiştirildi",
  },
  auth: {
    login: "Giriş yaptı",
    login_email_link: "E-posta bağlantısıyla giriş yaptı",
    login_failed: "Başarısız giriş denemesi",
    logout: "Çıkış yaptı",
    password_change: "Şifresini değiştirdi",
    initial_password_set: "İlk şifresini belirledi",
    password_reset: "Şifresini e-postayla sıfırladı",
  },
};

/** e.g. "Üye güncellendi"; unknown combinations fall back to their codes */
export function auditActionLabel(entityType: string, action: string) {
  return RECORD_ACTIONS[entityType]?.[action] ?? `${entityType} / ${action}`;
}

const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", {
  // fixed, so the server's time zone doesn't change what's rendered
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** "30.10.2026 14:02:05" in Turkish time */
export function formatAuditTime(value: string | Date) {
  return dateTimeFormat.format(new Date(value));
}
