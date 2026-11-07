<p align="center">
  <img src="claude_animation.gif" alt="AI İş Arama Asistanı" width="200">
</p>

# AI İş Arama (Türkiye)

[![CI](https://github.com/MertVkt/ai-is-arama/actions/workflows/ci.yml/badge.svg)](https://github.com/MertVkt/ai-is-arama/actions/workflows/ci.yml)

[Claude Code](https://claude.com/claude-code) üzerinde çalışan, Türkiye'deki iş arayanlar için hazırlanmış bir başvuru asistanı. Repoyu fork'la, profilini doldur, gerisini Claude halletsin: ilanları tarar, sana uygunluğunu puanlar, ilana özel özgeçmiş ve ön yazı hazırlar, mülakata hazırlar.

> Bu proje [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) projesinin Türkiye uyarlamasıdır. Asıl iş akışı (profil çıkarma, uygunluk değerlendirmesi, taslak-inceleme döngüsü) orijinal projeden geliyor. Bu sürümde Danimarka'ya özel parçalar çıkarıldı; Türk iş siteleri, Türkçe özgeçmiş ve ön yazı şablonları ve Türkiye'deki işe alım alışkanlıkları eklendi.
>
> Anthropic ile bağlantılı, onaylı veya Anthropic tarafından sürdürülen bir proje değildir. Claude Code yalnızca kullanılan aracı tanımlamak için anılır.

## Ne yapıyor?

```
/setup              /scrape                /apply <link>
  |                    |                       |
  v                    v                       v
Profilini          İş sitelerini           Uygunluğu değerlendirir
oluşturur          tarar                   Puanlar, önerir
  |                    |                       |
  v                    v                       v
Profil             Sana uyan ilanları      Özgeçmiş + Ön yazı taslağı
dosyaları hazır    uyum puanıyla listeler  (LaTeX, ilana özel)
                       |                       |
                       v                       v
                   Birini seç              İkinci bir ajan eleştirir
                   -> /apply               -> Düzeltir -> PDF
```

- **İlan tarama:** Secretcv, Eleman.net, İŞKUR, LinkedIn ve (teknoloji rolleri için) freehire.dev'de doğrudan arama yapar. Kariyer.net ve Yenibiriş bot korumalı olduğu için onlara otomatik girmez; senin için hazır arama linkleri çıkarır, beğendiğin ilanın metnini yapıştırman yeterli.
- **Dürüst değerlendirme:** Her ilanı beceri, deneyim, kültür, konum ve kariyer hedefi açısından puanlar. Uymayan ilana "başvur" demez.
- **İlana özel belgeler:** Türkçe ilana Türkçe özgeçmiş ve ön yazı, İngilizce ilana İngilizce. Askerlik ve ehliyet gibi yerli ilanlarda sorulan bilgileri yalnızca gerektiğinde ekler; fotoğraf, medeni durum, doğum tarihi gibi bilgileri sen istemedikçe koymaz.
- **Uydurma yok:** Belgelere profilinde olmayan hiçbir beceri veya deneyim yazılmaz.
- **PDF ve ATS kontrolü:** Özgeçmiş tam 2 sayfa, ön yazı tam 1 sayfa olana kadar derleyip kontrol eder. İşe alım yazılımlarının (ATS) PDF'i nasıl okuduğunu da test eder.
- **Mülakat hazırlığı:** Şirketi araştırır, olası soruları senin STAR örneklerinle eşler, istersen deneme mülakatı yapar.

## Gereksinimler

- [Claude Code](https://code.claude.com/docs/en/quickstart) ve bir Claude aboneliği (Pro, Max, Team veya Enterprise) ya da Claude Console hesabı
- Python 3.10+
- [Bun](https://bun.sh) (iş arama araçları için)
- LaTeX: `lualatex` ve `xelatex` içeren bir dağıtım ([TeX Live](https://tug.org/texlive/), [MacTeX](https://tug.org/mactex/), [MiKTeX](https://miktex.org/)). Ayrıntılar [SETUP.md](SETUP.md) içinde.
- İsteğe bağlı: `pdftotext` (ATS kontrolü için; yoksa görsel kontrole geçer)

Terminal kullanmaya alışık değilsen korkma: kurulumdan sonra her şeyi Claude ile Türkçe konuşarak yapıyorsun.

## Hızlı başlangıç

### 1. Fork'la ve indir

```bash
gh repo fork MertVkt/ai-is-arama --clone
cd ai-is-arama
```

`gh` yoksa GitHub'da sağ üstteki **Fork** düğmesine bas, sonra kendi kopyanı `git clone` ile indir.

### 2. İş arama araçlarını kur

macOS / Linux / Git Bash:

```bash
for tool in secretcv-search elemannet-search iskur-search linkedin-search freehire-search; do
  (cd .agents/skills/$tool/cli && bun install)
done
```

Windows PowerShell:

```powershell
$tools = @("secretcv-search", "elemannet-search", "iskur-search", "linkedin-search", "freehire-search")
foreach ($tool in $tools) {
  Push-Location ".agents/skills/$tool/cli"; bun install; Pop-Location
}
```

### 3. Profilini oluştur

```bash
claude
# Claude Code açılınca:
/setup
```

`/setup` üç yol sunar: `documents/` klasörüne koyduğun belgeleri (özgeçmiş PDF'i, LinkedIn dışa aktarımı, diplomalar, referans mektupları) okuyup profil çıkarmak, sohbete yapıştırdığın tek bir özgeçmişten başlamak ya da seninle adım adım sohbet ederek profili doldurmak. Klasör düzeni için `documents/README.md` dosyasına bak.

### 4. İlan tara

```
/scrape
```

Profiline uyan ilanları sitelerden toplar, daha önce gördüklerini eler, uyum puanıyla listeler. Liste kalabalıksa `/rank` hepsini detaylı puanlayıp kısa liste çıkarır.

### 5. Başvur

```
/apply https://www.eleman.net/is-ilani/garson-i4802953
```

Kariyer.net veya Yenibiriş gibi otomatik erişime kapalı bir siteden ilan seçtiysen metni doğrudan yapıştır:

```
/apply <ilan metninin tamamı>
```

Claude uygunluğu değerlendirir, onay verirsen özgeçmiş ve ön yazıyı hazırlar, ikinci bir ajana eleştirtir, düzeltir ve PDF'leri kontrol edip sana sunar.

## Diğer komutlar

| Komut | Ne işe yarar |
|---|---|
| `/rank` | `/scrape` sonrası bulunan tüm ilanları detaylı puanlar, sıralı kısa liste verir |
| `/interview` | Takip ettiğin bir başvurunun mülakatına hazırlar, istersen deneme mülakatı yapar |
| `/outcome` | Başvurunun sonucunu kaydeder (mülakat, teklif, red, sessizlik), belgeleri arşivler |
| `/expand` | Profiline eklediğin GitHub, portfolyo gibi kaynakları tarayıp yetkinliklerini zenginleştirir |
| `/upskill` | Hedef ilanlarla arandaki beceri açığını çıkarır, öğrenme planı hazırlar |
| `/add-template` | Kendi LaTeX özgeçmiş veya ön yazı şablonunu sisteme ekler |
| `/add-portal` | Listede olmayan bir iş sitesi için yeni arama aracı oluşturur |
| `/reset` | Profil verilerini veya belgeler klasörünü temizler (onay ister) |

## İş siteleri

| Site | Nasıl | Not |
|---|---|---|
| Secretcv | Doğrudan arama (`secretcv-search`) | Genel, beyaz yaka ağırlıklı |
| Eleman.net | Doğrudan arama (`elemannet-search`) | Perakende, hizmet, mavi yaka, KOBİ |
| İŞKUR | Doğrudan arama (`iskur-search`) | Resmi ilanlar: özel sektör ve kamu işçi ilanları |
| LinkedIn | Doğrudan arama (`linkedin-search`) | Yalnızca kişisel kullanım, az sayıda istek |
| freehire.dev | Doğrudan arama (`freehire-search`) | Sadece teknoloji rolleri, uzaktan dahil |
| Kariyer.net | Hazır arama linki + metin yapıştırma | Bot korumalı, otomatik erişilmez |
| Yenibiriş | Hazır arama linki + metin yapıştırma | Bot korumalı, otomatik erişilmez |

Türk iş siteleri için yazılan araçlar sitelerin `robots.txt` kurallarına uyar, kendini dürüstçe tanıtan bir istemci kimliği kullanır ve istekler arasında bekler. LinkedIn aracı ise orijinal projeden geliyor ve farklı çalışıyor: tarayıcı gibi görünen bir istemci kimliği kullanıyor ve otomatik erişim LinkedIn'in kullanım koşullarına aykırı. Kullanırsan az sayıda istekle, yalnızca kendi aramaların için kullan; risk sana ait. Captcha çözen veya bot korumasını aşmaya çalışan hiçbir şey yok, olmayacak da. Sitelerin sayfa yapısı değişirse araçlar bozulabilir; öyle bir şey görürsen issue açman çok yardımcı olur.

Listede olmayan bir site mi kullanıyorsun? `/add-portal` ile kendi aracını oluşturabilirsin.

## Klasör yapısı

```
├── CLAUDE.md                        # Ana profil ve iş akışı kuralları
├── .claude/
│   ├── commands/                    # /setup, /apply, /rank, /interview ... komutları
│   ├── skills/
│   │   ├── job-application-assistant/  # Profil, değerlendirme, özgeçmiş, ön yazı, mülakat
│   │   ├── job-scraper/             # /scrape ve arama sorguları
│   │   └── upskill/                 # Beceri açığı analizi
│   └── settings.json                # Claude Code izinleri
├── .agents/skills/                  # İş sitesi arama araçları (Bun CLI)
├── cv/main_example.tex              # Türkçe özgeçmiş şablonu (moderncv)
├── cover_letters/                   # Türkçe ön yazı şablonu (cover.cls + fontlar)
├── documents/                       # /setup için kaynak belgelerin
├── templates/                       # /add-template ile eklenen şablonlar
├── salary_lookup.py                 # Maaş karşılaştırma aracı (kendi verinle, isteğe bağlı)
├── tools/                           # Maaş dönüştürücü, CI lint ve güvenlik kontrolleri
└── SETUP.md                         # Ayrıntılı kurulum rehberi
```

## İyi sonuç almak için

- **Profil ne kadar detaylıysa sonuç o kadar iyi.** Sadece unvan yazma; her işte gerçekte ne yaptığını, hangi araçları kullandığını, neyi başardığını anlat. "Excel" yerine "Satış verisini Excel'de pivot tablolarla raporlayıp aylık 2 günlük işi yarım güne indirdim" gibi.
- **Neyin seni heyecanlandırdığını da söyle.** Claude yalnızca hedeflediğin rollere değil, deneyiminden çıkan ve aklına gelmemiş kariyer yollarına da bakabiliyor.
- **Portal profilini güncel tut.** Pek çok şirket başvuruyu Kariyer.net veya Secretcv formu üzerinden alıyor. Buradan çıkan özgeçmişle portal profilin birbirini tutsun.

## Maaş karşılaştırma

İsteğe bağlı. Türkiye'de herkese açık tek bir şirket bazlı maaş verisi yok, o yüzden araç senin topladığın veriyle çalışır. Ayrıntılar `tools/README_SALARY_TOOL.md` içinde. Veri yoksa `/apply` bu adımı atlar.

## Katkı

PR göndermeden önce [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına göz at.

## Teşekkürler

- Asıl proje: [Mads Lorentzen](https://github.com/MadsLorentzen) ve [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) katkıcıları
- Orijinal iş arama CLI yapısı: [Mikkel Krogsholm](https://github.com/mikkelkrogsholm) ([skills repo](https://github.com/mikkelkrogsholm/skills))
- Türkiye uyarlaması: [Mert Vakitsayan](https://github.com/MertVkt)

## Lisans

MIT. Ayrıntılar için [LICENSE](LICENSE).
