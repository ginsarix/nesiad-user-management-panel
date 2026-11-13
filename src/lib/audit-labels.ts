import type { AuditEntityTypeFilter } from "./audit-filters";

export const ENTITY_TYPE_LABELS: Record<AuditEntityTypeFilter, string> = {
  member: "Üyeler",
  representative: "Yetkililer",
  management_board: "Yönetim",
  committee: "Komiteler",
  disciplinary_board: "Disiplin Kurulu",
  supervisory_board: "Denetim Kurulu",
  sector: "Sektörler",
  parameter: "Parametreler",
  counterparty: "Cariler",
  payment: "Ödemeler",
  project: "Projeler",
  collection: "Tahsilatlar",
  panel_user: "Panel kullanıcıları",
  sms: "SMS",
  auth: "Oturum açma",
};

const RECORD_ACTIONS: Record<string, Record<string, string>> = {
  member: {
    create: "Üye eklendi",
    update: "Üye güncellendi",
    delete: "Üye silindi",
    application_accept: "Başvuru kabul edildi",
    application_add_passive: "Başvuru pasif üye olarak eklendi",
    application_reject: "Başvuru reddedildi",
    application_reopen: "Başvuru tekrar adaya alındı",
    application_notice: "Başvuru bildirimi gönderildi",
  },
  representative: {
    create: "Yetkili eklendi",
    update: "Yetkili güncellendi",
    delete: "Yetkili silindi",
  },
  management_board: {
    create: "Yönetim eklendi",
    update: "Yönetim güncellendi",
    delete: "Yönetim silindi",
  },
  committee: {
    create: "Komite eklendi",
    update: "Komite güncellendi",
    delete: "Komite silindi",
  },
  disciplinary_board: {
    create: "Disiplin Kurulu eklendi",
    update: "Disiplin Kurulu güncellendi",
    delete: "Disiplin Kurulu silindi",
  },
  supervisory_board: {
    create: "Denetim Kurulu eklendi",
    update: "Denetim Kurulu güncellendi",
    delete: "Denetim Kurulu silindi",
  },
  sector: {
    create: "Sektör eklendi",
    update: "Sektör adı değiştirildi",
    delete: "Sektör silindi",
  },
  parameter: {
    create: "Parametre eklendi",
    update: "Parametre adı değiştirildi",
    delete: "Parametre silindi",
  },
  counterparty: {
    create: "Cari eklendi",
    update: "Cari güncellendi",
    delete: "Cari silindi",
  },
  payment: {
    create: "Ödeme eklendi",
    update: "Ödeme güncellendi",
    delete: "Ödeme silindi",
  },
  project: {
    create: "Proje eklendi",
    update: "Proje güncellendi",
    delete: "Proje silindi",
  },
  collection: {
    create: "Tahsilat eklendi",
    update: "Tahsilat güncellendi",
    delete: "Tahsilat silindi",
    collection_notice: "Tahsilat bildirimi gönderildi",
  },
  panel_user: {
    create: "Panel kullanıcısı eklendi",
    update: "Panel kullanıcısının adı değiştirildi",
    delete: "Panel kullanıcısı silindi",
    password_set: "Panel kullanıcısına şifre belirlendi",
    disable: "Panel kullanıcısı devre dışı bırakıldı",
    enable: "Panel kullanıcısı etkinleştirildi",
    verification_email: "Doğrulama e-postası gönderildi",
    phone_code_sent: "Telefon doğrulama kodu gönderildi",
    phone_change: "Panel kullanıcısının telefonu değiştirildi",
  },
  sms: {
    send: "SMS gönderildi",
    auto_send: "Kutlama SMS'i gönderildi",
    auto_send_failed: "Kutlama SMS'i gönderilemedi",
    auto_send_unknown: "Kutlama SMS'i: NetGSM yanıt vermedi",
    settings_update: "SMS ayarları değiştirildi",
    notice_settings_update: "Başvuru bildirim şablonları değiştirildi",
    collection_notice_settings_update:
      "Tahsilat bildirim şablonları değiştirildi",
  },
  auth: {
    login: "Giriş yaptı",
    login_email_link: "E-posta bağlantısıyla giriş yaptı",
    login_failed: "Başarısız giriş denemesi",
    login_code_sent: "Giriş kodu gönderildi",
    login_code_failed: "Hatalı giriş kodu",
    login_code_locked: "Giriş kodu denemeleri kilitlendi (15 dakika)",
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
