# Maaş Karşılaştırma Aracı

## Bu araç ne işe yarar?

`salary_lookup.py`, kendi topladığın maaş verisinde bir şirketi arar ve o şirketin maaşlarını senin belirlediğin bir referans değerle karşılaştırır. `/apply` akışında, ilana başvurmadan önce şirketin ücret tarafında nerede durduğunu görmek için kullanılır.

**Araç isteğe bağlıdır.** Maaş verin yoksa `/apply` bu adımı atlar, başka hiçbir şey etkilenmez.

## Veriyi neden kendin getiriyorsun?

Türkiye'de şirket bazında maaşları gösteren, herkese açık ve indirilebilir tek bir veri seti yok. Bu yüzden araç hazır bir veriyle gelmiyor. Elindeki bilgiyi bir tabloya dökersen araç onu okur.

Veriyi şuralardan toplayabilirsin:

- Kendi notların ve görüşmelerde konuşulan rakamlar
- Daha önce aldığın teklifler
- Erişimin olan maaş anketleri (şirketinin, bir derneğin ya da danışmanlık firmasının paylaştığı raporlar gibi)
- Glassdoor veya Kariyer.net maaş sayfalarında gördüğün rakamlar. Bu sitelerin bu araç için bir dışa aktarma ya da API seçeneği yok, rakamları kendin bakıp tabloya elle yazman gerekiyor.
- Aynı sektörde çalışan tanıdıklarından duyduğun aralıklar

Kaç şirket eklediğin sana kalmış. Başvurduğun birkaç şirketle başlayıp zamanla büyütebilirsin.

## Nasıl çalışır?

Araç repo kök dizinindeki `salary_data.json` dosyasını okur ve şirket adını esnek bir şekilde eşleştirir:

- Türkçe büyük/küçük harf kurallarını doğru uygular. "İŞ BANKASI", "iş bankası" ve "İş Bankası" aynı şirket sayılır. Noktalı ve noktasız i farkı (I/ı, İ/i) eşleşmeyi bozmaz.
- Türkçe karakterleri İngilizce klavye karşılıklarıyla da eşleştirir (ş/s, ğ/g, ç/c, ö/o, ü/u, ı/i). Yani "Is Bankasi" yazsan da "İş Bankası" bulunur.
- Şirket türü eklerini ve sık geçen dolgu kelimelerini yok sayar: "A.Ş.", "AŞ", "Anonim Şirketi", "Ltd. Şti.", "Limited Şirketi", "San. ve Tic.", "Sanayi ve Ticaret", "Holding", "Grup", "Türkiye", "Türkiye Şubesi" gibi. Parantez içindeki kısımları ve virgülden sonrasını da dikkate almaz.
- "Trendyol", "Getir", "Insider", "Peak Games" gibi İngilizce isimler de aynı şekilde çalışır.

Örneğin `Türkiye İş Bankası A.Ş.` olarak kaydettiğin bir şirket "İş Bankası", "is bankasi" veya "İŞ BANKASI" aramasıyla bulunur.

Değerler iki şekilde tutulabilir:

- **Endeks:** Örneğin 100 = piyasa medyanı. 110, medyanın yüzde 10 üstü demek.
- **Mutlak maaş:** Örneğin aylık brüt maaş, Türk lirası cinsinden.

## Veri formatı

`salary_data.json` şu yapıda olmalı:

```json
{
  "metadata": {
    "source": "Kendi notlarım ve aldığım teklifler, 2026",
    "index_baseline": 80000,
    "index_label": "Aylık brüt (TL)",
    "baseline_description": "Referans: 80.000 TL aylık brüt (benim hedefim)"
  },
  "companies": [
    {
      "company": "Türkiye İş Bankası A.Ş.",
      "city": "İstanbul",
      "categories": {
        "yazilim_gelistirici": { "count": 3, "index": 85000 },
        "kidemli_yazilim_gelistirici": { "count": 2, "index": 120000 }
      }
    },
    {
      "company": "Trendyol",
      "city": "İstanbul",
      "categories": {
        "veri_bilimci": { "count": 1, "index": 95000 }
      }
    }
  ]
}
```

### Alanlar

- **metadata.source**: Verinin nereden geldiği (sadece bilgi amaçlı)
- **metadata.index_baseline**: Karşılaştırma için referans değer. Endeks verisinde genelde 100, mutlak maaşta kendi hedef maaşın ya da bildiğin bir piyasa rakamı. 0 yazarsan araç yüzde farkı göstermez, sadece değerleri listeler.
- **metadata.index_label**: Çıktıda değer sütununun başlığı (örneğin "Endeks" veya "Aylık brüt (TL)")
- **metadata.baseline_description**: Referans değerin ne anlama geldiğini anlatan kısa bir cümle
- **companies[].company**: Şirket adı (zorunlu)
- **companies[].city**: Şehir veya ilçe (isteğe bağlı, `--city` ile filtrelemede kullanılır)
- **companies[].categories**: Pozisyon veya grup bazında değerler. Her biri `index` (endeks ya da maaş) ve isteğe bağlı olarak `count` (bu rakamın kaç kişiye ya da kaç kaynağa dayandığı) içerir.

Rakamların brüt mü net mi olduğunu `index_label` veya `baseline_description` içinde açıkça yaz. Aynı dosyada brüt ve neti karıştırmamaya dikkat et.

## Kurulum seçenekleri

### Seçenek A: salary_data.json dosyasını elle oluştur

Yukarıdaki örneği kopyalayıp kendi rakamlarınla doldur. Az sayıda şirket için en hızlı yol bu.

### Seçenek B: Excel'den dönüştür

Verin bir Excel tablosundaysa:

```bash
pip install openpyxl
python3 tools/convert_salary_excel.py yol/maas-verisi.xlsx \
  --source "Maaş notlarım 2026" \
  --baseline 80000 \
  --label "Aylık brüt (TL)" \
  --baseline-desc "Referans: 80.000 TL aylık brüt"
```

Endeks kullanıyorsan `--baseline 100 --baseline-desc "Endeks 100 = medyan maaş"` yeterli, `--label` vermezsen başlık "Index" olur.

Windows'ta Python `py` komutuyla açılıyorsa onu kullan. Sisteminde `python3` yerine `python` varsa örneklerde onu yaz.

Dönüştürücü tablonun yapısını kendisi bulur:

- Başlık satırını ilk 10 satır içinde arar. Şirket sütunu "Firma", "Şirket", "Şirket Adı", "İşveren", "Company" veya "Employer" başlıklı olmalı.
- Şehir sütunu isteğe bağlı: "Şehir", "İl", "İlçe", "Konum", "City" veya "Location".
- Kalan sütunları veri olarak alır. "Maaş", "Ücret", "Brüt", "Net", "Ortalama", "Medyan", "Endeks" (ve İngilizce karşılıkları) geçen başlıklar değer, "Adet", "Sayı", "Çalışan Sayısı", "Kişi", "Count" geçen başlıklar adet olarak tanınır. Yan yana duran bir adet ve bir değer sütunu tek kategori olarak eşleştirilir.
- Başlıklar büyük harfle de yazılabilir ("ŞİRKET", "ÇALIŞAN SAYISI"), Türkçe harfler doğru okunur.
- Hücrelerdeki "45.000 TL", "₺52.500,50" gibi metin olarak girilmiş rakamlar da sayıya çevrilir (nokta binlik, virgül ondalık ayırıcı kabul edilir).

Örnek bir tablo:

| Şirket | Şehir | Yazılım Çalışan Sayısı | Yazılım Brüt Maaş (TL) |
|---|---|---|---|
| Türkiye İş Bankası A.Ş. | İstanbul | 3 | 85.000 |
| Getir | İstanbul | 2 | 90.000 |

Bu tablo `yazılım` adlı tek bir kategori olarak okunur (adet ve maaş birlikte).

### Seçenek C: Araştırdıkça ekle

Boş bir şablonla başla, her başvuruda şirketi araştırırken bulduğun rakamı ekle:

```json
{
  "metadata": {
    "source": "Kişisel araştırma",
    "index_baseline": 0,
    "index_label": "Aylık brüt (TL)",
    "baseline_description": "Yaklaşık aylık brüt maaş"
  },
  "companies": [
    {
      "company": "Örnek Teknoloji A.Ş.",
      "city": "Ankara",
      "categories": {
        "junior": { "index": 55000 },
        "senior": { "index": 95000 }
      }
    }
  ]
}
```

## Kullanım

```bash
python3 salary_lookup.py "İş Bankası"
python3 salary_lookup.py "Trendyol" --city "İstanbul"
python3 salary_lookup.py "Peak Games" --json
python3 salary_lookup.py --list-all
```

`--city "Istanbul"` gibi Türkçe karaktersiz yazımlar da çalışır.

## Bilmen gerekenler

- `salary_data.json` git'e **eklenmez** (`.gitignore` içinde). Maaş verin kişisel ya da gizli olabilir, repoda kalmaz.
- Dosya yoksa `salary_lookup.py` açıklayıcı bir hata mesajıyla çıkar ve `/apply` maaş karşılaştırma adımını atlar.
- Sonuçlar ancak girdiğin veri kadar güvenilir. Tek bir kişiden duyduğun rakamı `count: 1` olarak işaretlemek, ileride ne kadar güvenebileceğini görmeni kolaylaştırır.
- Türkiye'de maaşlar hızlı değiştiği için verinin hangi döneme ait olduğunu `source` alanına yazmak işine yarar.
