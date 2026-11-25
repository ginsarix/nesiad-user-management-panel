import { isoToDisplay } from "./dates";
import { foldTr } from "./turkish";

// Sürüm Notları: what changed in the panel, for staff, in Turkish. The page,
// the sidebar and the new-version dialog all read this file.

export type ReleaseNoteType =
  | "new"
  | "improved"
  | "changed"
  | "fixed"
  | "removed";

/** Display order of the types, in a version and in the filter */
export const RELEASE_NOTE_TYPES: readonly ReleaseNoteType[] = [
  "new",
  "improved",
  "changed",
  "fixed",
  "removed",
];

export const RELEASE_NOTE_LABELS: Record<ReleaseNoteType, string> = {
  new: "Yeni",
  improved: "İyileştirildi",
  changed: "Değiştirildi",
  fixed: "Düzeltildi",
  removed: "Silindi",
};

/** One plain sentence; no markdown or links */
export type ReleaseNote = { type: ReleaseNoteType; text: string };

export type ReleaseVersion = {
  /** yyyy-aa-gg, the day it went to production */
  date: string;
  /** 2, 3… for later deploys the same day */
  revision?: number;
  /** e.g. "İlk sürüm" */
  label?: string;
  entries: ReleaseNote[];
};

/**
 * Newest first. Every change staff would notice adds its notes here in the
 * same change, dated the day it's pushed to main.
 * - Never add notes to a version that has been deployed: a later deploy the
 *   same day gets a new version with the same date and the next revision
 *   (2, 3…), so everyone who saw the first notice sees the new one too.
 * - A version's id (date, plus -v<revision>) never changes once shipped:
 *   user.release_notes_seen stores it.
 */
export const RELEASE_VERSIONS: ReleaseVersion[] = [
  {
    date: "2026-11-25",
    entries: [
      {
        type: "new",
        text: "Genel Bakış sayfasında Kasa - Banka bakiyeleri: aktif hesapların ilk beşi, isme göre sıralı.",
      },
      {
        type: "new",
        text: "Kasa - Banka dönemleri: her hesaba başlangıç tarihi ve başlangıç bakiyesi olan dönemler eklenebilir; hesap sayfasında her dönem kendi sekmesinde görünür.",
      },
      {
        type: "new",
        text: 'Kasa - Banka sayfasında Devir: bir dönemin bakiyesi "Devir et" ile sonraki bir döneme aktarılır; kaynak dönem sonradan değişirse sayfa uyarır.',
      },
      {
        type: "improved",
        text: "Ödeme ve tahsilat formlarındaki Kasa - Banka bölümü, girilen tarihin dönemindeki bakiyeyi gösterir; tarih hesabın hiçbir dönemine girmiyorsa uyarır.",
      },
      {
        type: "changed",
        text: "Başlangıç Bakiyesi artık hesabın dönemlerinde tutulur; mevcut hesapların bakiyesi 01.01.2026 dönemine taşındı ve listede, Genel Bakış'ta bugünün döneminin bakiyesi gösterilir.",
      },
    ],
  },
  {
    date: "2026-11-24",
    entries: [
      {
        type: "new",
        text: "Sürüm Notları sayfası: panelde neyin ne zaman değiştiği, aranabilir ve türe göre süzülebilir şekilde listeleniyor.",
      },
      {
        type: "new",
        text: "Panel güncellendiğinde yenilikler, panelde bir kez açılan pencerede gösteriliyor.",
      },
      {
        type: "new",
        text: "Organizasyon altında Onur Kurulu sayfası.",
      },
      {
        type: "new",
        text: "Panel Kullanıcıları listesinde Son Giriş Tarihi sütunu.",
      },
      {
        type: "improved",
        text: "Yetkilinin organizasyon görevleri artık yetkili formundaki Organizasyonlar bölümünden de düzenlenebiliyor.",
      },
      {
        type: "improved",
        text: "Yeni tahsilat SMS'i ve e-postası her panel kullanıcısı için Panel Kullanıcıları sayfasından ayrı ayrı açılıp kapatılabiliyor.",
      },
    ],
  },
  {
    date: "2026-11-23",
    entries: [
      {
        type: "new",
        text: "Finans altında Kasa - Banka sayfası: kasalar ve banka hesapları, Başlangıç Bakiyesi ve güncel Bakiye ile listeleniyor.",
      },
      {
        type: "new",
        text: "Yetkililerde PO Positive Card No alanı.",
      },
      {
        type: "changed",
        text: "Her ödeme ve tahsilatta paranın girdiği veya çıktığı Kasa - Banka seçiliyor.",
      },
      {
        type: "removed",
        text: "Parametreler'deki Ödeme Tipi ve Tahsilat Tipi listeleri kaldırıldı; yerlerini Kasa - Banka aldı.",
      },
    ],
  },
  {
    date: "2026-11-13",
    entries: [
      {
        type: "new",
        text: "Yetkililere fotoğraf eklenebiliyor; fotoğraflar yetkili adlarının yanında yuvarlak olarak görünüyor.",
      },
      {
        type: "new",
        text: "Projelerde Taahhütler: yetkililerin projeye verdiği sözler Adet ve Tutar ile, satır ve genel toplamlarıyla kaydediliyor.",
      },
      {
        type: "new",
        text: 'Taahhütlerde "Adet ve tutarı tüm satırlara uygula" kutusu; işaretliyken yapılan değişiklikler Cmd/Ctrl+Z ile geri alınabiliyor.',
      },
      {
        type: "new",
        text: "Finans altında Tahakkuk sayfası: Yetkili, Aidat ve Tutar satırlarından oluşan tek liste.",
      },
      {
        type: "improved",
        text: "Tutar içeren her tablonun altında Toplam satırı.",
      },
      {
        type: "changed",
        text: "Tahsilatlar artık üyeye değil yetkiliye bağlı; yeni tahsilat bildirimi de yetkiliye gidiyor.",
      },
      {
        type: "changed",
        text: "Yönetimler sayfasının adı Yönetim oldu.",
      },
    ],
  },
  {
    date: "2026-11-11",
    entries: [
      {
        type: "new",
        text: "Genel Bakış: girişten sonra açılan, ilgilenilmesi gerekenleri ve bu yılın özetini gösteren sayfa.",
      },
      {
        type: "new",
        text: "Organizasyon menüsü: Yönetimler, Komiteler, Disiplin Kurulu ve Denetim Kurulu sayfalarında yetkililer ve Dernek Görevleri ile gruplar oluşturuluyor.",
      },
      {
        type: "new",
        text: "Parametreler'de Dernek Görevleri listesi.",
      },
      {
        type: "new",
        text: "Yetkili sayfasında yetkilinin yer aldığı organizasyon grupları görünüyor.",
      },
      {
        type: "improved",
        text: "Kaydedilmemiş değişiklikler varken sayfadan ayrılmak istendiğinde uyarı veriliyor.",
      },
      {
        type: "improved",
        text: "Bildirim metinleri düzenlenirken yanında önizleme görünüyor ve yer tutucular düğmeyle ekleniyor.",
      },
      {
        type: "changed",
        text: "Bildirim metinleri Ayarlar sayfasındaki Bildirimler sekmesine taşındı ve sekme tek seferde kaydediliyor.",
      },
      {
        type: "changed",
        text: "30 dakika işlem yapılmayan oturumlar kendiliğinden kapanıyor.",
      },
      {
        type: "changed",
        text: "Üyeler listesinde üyenin adına tıklayınca detay sayfası açılıyor.",
      },
      {
        type: "fixed",
        text: "SMS metinlerindeki desteklenmeyen karakterler artık gönderimi bozmuyor.",
      },
    ],
  },
  {
    date: "2026-11-10",
    entries: [
      {
        type: "new",
        text: "Finans menüsü: Cariler ve Ödemeler sayfaları, filtreler ve Excel'e aktarma ile.",
      },
      {
        type: "new",
        text: "Projeler ve Tahsilatlar sayfaları; tahsilatlar bir projeye bağlanabiliyor ve Excel'e aktarılabiliyor.",
      },
      {
        type: "new",
        text: "Yeni tahsilatta ilgili üyeye ve diğer panel kullanıcılarına e-posta ve SMS ile bildirim gidiyor.",
      },
      {
        type: "new",
        text: "Ayarlar'da Parametreler sekmesi: Tahsilat Türü, Ödeme Türü, Tahsilat Tipi ve Ödeme Tipi listeleri.",
      },
      {
        type: "new",
        text: "Başvuru reddedilirken yalnızca personelin göreceği bir Ret Notu yazılabiliyor.",
      },
      {
        type: "improved",
        text: "Üye logosu olarak PDF ve SVG dosyaları da yüklenebiliyor.",
      },
      {
        type: "improved",
        text: "Tarih alanlarında noktalar yazarken kendiliğinden ekleniyor.",
      },
      {
        type: "changed",
        text: "Otomatik kutlama SMS'leri artık varsayılan olarak açık.",
      },
    ],
  },
  {
    date: "2026-11-09",
    entries: [
      {
        type: "new",
        text: "Girişte şifreden sonra cep telefonuna SMS ile gelen kod soruluyor; SMS gitmezse veya istenirse kod e-posta ile gönderiliyor.",
      },
      {
        type: "new",
        text: "Her panel kullanıcısının bir cep telefonu var; numara eklenirken veya değiştirilirken SMS koduyla doğrulanıyor.",
      },
      {
        type: "new",
        text: 'Başvuru kaydedildiğinde başvurana "Başvurunuz alındı" e-postası ve SMS\'i gidiyor.',
      },
      {
        type: "improved",
        text: "Başvuru formunun adımları arasında serbestçe ileri geri gidilebiliyor.",
      },
      {
        type: "changed",
        text: 'Başvuru formunda Eğitim listeden seçiliyor, firma tanıtımı en az 1000 karakter olmalı ve diğer dernekler sorusu "Dernek, meslek grupları" oldu.',
      },
    ],
  },
  {
    date: "2026-11-06",
    entries: [
      {
        type: "new",
        text: "/uyelik adresinde herkese açık üyelik başvuru formu; başvurular Aday olarak Üyeler'e düşüyor.",
      },
      {
        type: "new",
        text: "Başvurular için Kabul Et, Pasif olarak ekle, Reddet ve Tekrar Aday yap kararları; kabul ve retlerde başvurana e-posta ve SMS gidiyor.",
      },
      {
        type: "new",
        text: "Başvuru bildirimlerinin metinleri panelden düzenlenebiliyor.",
      },
      {
        type: "new",
        text: "Üye sayfasında başvuru bilgileri ve belgeleri görüntülenip düzenlenebiliyor.",
      },
      {
        type: "changed",
        text: "Üyelerin Aktif/Pasif işaretinin yerini durum aldı: Aktif, Pasif, Aday veya Reddedildi.",
      },
      {
        type: "changed",
        text: "Sektörler yeni Ayarlar sayfasına taşındı.",
      },
    ],
  },
  {
    date: "2026-11-03",
    label: "İlk sürüm",
    entries: [
      {
        type: "new",
        text: "Üyeler: arama ve sektör filtresiyle liste, detay sayfası, logo, Aktif/Pasif durumu ve Üye Giriş Tarihi'nden hesaplanan Kıdem.",
      },
      {
        type: "new",
        text: "Yetkililer: üyelere görevleriyle bağlanan yetkili kayıtları.",
      },
      {
        type: "new",
        text: "Sektörler listesi ve üyelerin sektöre bağlanması.",
      },
      {
        type: "new",
        text: "SMS sayfası: seçilen kişilere SMS gönderimi ve doğum günleri ile kuruluş yıl dönümlerinde otomatik kutlama SMS'i.",
      },
      {
        type: "new",
        text: "Panel Kullanıcıları sayfası ve e-posta ile şifre sıfırlama.",
      },
      {
        type: "new",
        text: "Denetim Kayıtları: paneldeki değişikliklerin kim tarafından ve ne zaman yapıldığı.",
      },
      {
        type: "new",
        text: "Tablolarda Sütunlar düğmesiyle gösterilecek sütunlar seçilebiliyor.",
      },
    ],
  },
];

/** "2026-11-24", or "2026-11-24-v2" for a later deploy the same day */
export function releaseVersionId(version: ReleaseVersion) {
  return version.revision
    ? `${version.date}-v${version.revision}`
    : version.date;
}

export const LATEST_RELEASE_ID = releaseVersionId(RELEASE_VERSIONS[0]);

const longDate = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const revisionSuffix = (version: ReleaseVersion) =>
  version.revision ? ` V${version.revision}` : "";

/** "24 Kasım 2026", or "24 Kasım 2026 V2" */
export function formatReleaseVersion(version: ReleaseVersion) {
  return (
    longDate.format(new Date(`${version.date}T00:00:00Z`)) +
    revisionSuffix(version)
  );
}

/** "24.11.2026", or "24.11.2026 V2" */
export function shortReleaseVersion(version: ReleaseVersion) {
  return isoToDisplay(version.date) + revisionSuffix(version);
}

/** The entries in type order, keeping the written order within a type */
export function sortedEntries(version: ReleaseVersion) {
  return RELEASE_NOTE_TYPES.flatMap((type) =>
    version.entries.filter((entry) => entry.type === type),
  );
}

/**
 * The versions newer than the one last seen, newest first, by list order.
 * Nothing seen yet → only the newest (nobody gets the whole history). An id
 * that isn't in the list goes by its date and revision: newer than the list
 * (production rolled back) → nothing; older (its version was removed, e.g.
 * a reverted deploy) → the versions after it, so notices don't stop for good.
 */
export function unseenReleaseVersions(
  seenId: string | null,
  versions: ReleaseVersion[] = RELEASE_VERSIONS,
) {
  if (seenId === null) return versions.slice(0, 1);
  const index = versions.findIndex(
    (version) => releaseVersionId(version) === seenId,
  );
  if (index !== -1) return versions.slice(0, index);

  const seen = seenId.match(/^(\d{4}-\d{2}-\d{2})(?:-v(\d+))?$/);
  if (!seen) return [];
  const [, date, revision = "1"] = seen;
  return versions.filter(
    (version) =>
      version.date > date ||
      (version.date === date && (version.revision ?? 1) > Number(revision)),
  );
}

/** The version id in an address's #hash, or null (never throws) */
export function versionIdFromHash(hash: string) {
  try {
    return decodeURIComponent(hash.replace(/^#/, "")) || null;
  } catch {
    return null;
  }
}

/**
 * Only the entries matching the search (Turkish-aware) and type; versions
 * left without entries are dropped. A blank query doesn't filter.
 */
export function filterReleaseVersions(
  versions: ReleaseVersion[],
  filter: { query: string; type: ReleaseNoteType | null },
) {
  const query = foldTr(filter.query.trim());
  if (!query && !filter.type) return versions;
  return versions
    .map((version) => ({
      ...version,
      entries: version.entries.filter(
        (entry) =>
          (!filter.type || entry.type === filter.type) &&
          (!query || foldTr(entry.text).includes(query)),
      ),
    }))
    .filter((version) => version.entries.length > 0);
}

/**
 * Where the search matches in the original text, as [start, end) ranges.
 * foldTr keeps one character per character for normal text, so positions
 * carry over; if it ever doesn't, nothing is highlighted.
 */
export function matchRanges(
  text: string,
  query: string,
): [start: number, end: number][] {
  const folded = foldTr(text);
  const needle = foldTr(query.trim());
  if (!needle || folded.length !== text.length) return [];
  const ranges: [number, number][] = [];
  for (
    let at = folded.indexOf(needle);
    at !== -1;
    at = folded.indexOf(needle, at + needle.length)
  ) {
    ranges.push([at, at + needle.length]);
  }
  return ranges;
}
