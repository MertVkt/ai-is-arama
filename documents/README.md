# Belgeler Klasörü

Kariyer belgelerin bu klasörde duruyor. `/setup` komutu buradaki her şeyi okur ve `.claude/skills/job-application-assistant/` altındaki aday skill dosyalarını bunlarla doldurur. Yeni belge ekledikçe `/setup`'ı yeniden çalıştırabilirsin: yeni bilgiyi mevcut içerikle birleştirir, var olan bir şeyin üzerine sana sormadan yazmaz.

> **Gizlilik uyarısı:** Bu klasöre koyduğun belgeler kişisel verilerinle dolu. Repoyu herkese açık (public) bir fork olarak tutuyorsan commit ettiğin her dosyayı herkes görebilir, sonradan silsen bile git geçmişinde kalır. Kendi belgelerini ekleyeceksen repoyu **private (gizli) bir fork** olarak tut ya da bu klasörü commit etme.

---

## Klasör Yapısı

```
documents/
├── cv/                          # CV dosyaların (PDF ya da LaTeX)
├── linkedin/                    # LinkedIn profil dışa aktarımı (PDF)
├── diplomas/                    # Diplomalar, transkriptler, mezuniyet belgeleri
├── references/                  # Referans mektupları
├── applications/                # Geçmiş iş başvuruların
│   └── <company>_<role>/
│       ├── job_posting.md       # Orijinal iş ilanı (metin olarak yapıştır)
│       ├── cover_letter.tex     # Gönderdiğin ön yazı
│       ├── cv_draft.tex         # Gönderdiğin CV versiyonu
│       └── outcome.md           # Sonuç ve notlar (dönüş aldıktan sonra doldur)
└── README.md                    # Bu dosya
```

---

## cv/

Ana CV'n: iş geçmişinin en eksiksiz, hiçbir ilana göre kırpılmamış hali.

**Desteklenen formatlar:** `.pdf`, `.tex`

**`/setup` buradan neleri çıkarır:**
- İş deneyimi (unvan, şirket, tarihler, maddeler)
- Eğitim (bölüm, okul, tarihler, tez konuları)
- Teknik beceriler
- Ödüller ve yayınlar
- İletişim bilgileri

**Dosya adı:** İstediğin adı verebilirsin. Birden fazla dosya varsa `/setup` hepsini okur ve tutarlılık için birbiriyle karşılaştırır.

**İpucu:** Buraya belirli bir ilana göre uyarlanmış bir versiyonu değil, en kapsamlı CV'ni koy. Asıl kaynak skill dosyalarıdır; her başvuruya özel CV'yi zaten `/apply` üretiyor.

---

## linkedin/

LinkedIn profilinin PDF olarak dışa aktarılmış hali.

**Nasıl alınır:** LinkedIn'de profiline git, "Diğer" (More) menüsünden "PDF olarak kaydet" (Save to PDF) seçeneğine tıkla. Profilinin düzenli bir özetini PDF olarak indirir.

**Desteklenen formatlar:** `.pdf`

**`/setup` buradan neleri çıkarır:**
- İş deneyimi ve tarihler (CV'nle karşılaştırılır)
- Beceriler ve onaylar (endorsement)
- Eğitim
- Sertifikalar ve lisanslar
- Gönüllü çalışmalar
- Yayınlar
- Hakkında/özet bölümü (davranış profiline eklemeler yapmak için kullanılır)
- Aldığın tavsiyeler (referans bağlamını zenginleştirebilir)

**Dosya adı:** İstediğin adı verebilirsin. Tek bir LinkedIn dosyası bekleniyor; birden fazla varsa `/setup` en son değiştirileni kullanır.

---

## diplomas/

Diplomalar, transkriptler ve resmi yeterlilik belgelerin. Örneğin diploma, transkript, YÖK mezun belgesi ya da sertifikaların.

**Desteklenen formatlar:** `.pdf`

**`/setup` buradan neleri çıkarır:**
- Derece ve bölümlerin resmi adları (eğitim bilgilerini doğrulamak için)
- Mezuniyet tarihleri
- Not ortalaması ya da dereceler (belgede görünüyorsa)
- Okul adları (resmi yazılışıyla)

**Dosya adı:** Açıklayıcı adlar kullan, örneğin `lisans_bilgisayar_muh_deu_2016.pdf`, `yuksek_lisans_yapay_zeka_odtu_2019.pdf`. Dosya adı okumayı etkilemez.

**e-Devlet belgeleri hakkında:** İstersen e-Devlet'ten aldığın PDF'leri de ekleyebilirsin, mesela YÖK mezun belgesi ya da SGK hizmet dökümü (iş geçmişindeki tarihleri doğrulamak için işe yarar). Ama dikkat: bu belgelerde **T.C. kimlik numaran** yazıyor. Böyle dosyaları kesinlikle herkese açık bir repoya commit etme, sadece private fork'ta ya da hiç commit etmeden yerelde tut.

---

## references/

Eski yöneticilerinden, hocalarından ya da birlikte çalıştığın kişilerden aldığın referans mektupları.

**Desteklenen formatlar:** `.pdf`, `.txt`, `.md`

**`/setup` buradan neleri çıkarır:**
- Referans verenin adı, unvanı ve kurumu
- Senin hakkındaki somut alıntılar ve değerlendirmeler (`01-candidate-profile.md` içindeki referanslar bölümüne eklenir)
- Referans verenlerin yetkinliklerini anlatırken kullandığı ifadeler (`02-behavioral-profile.md`'ye davranışsal sinyal olarak eklenir)

**Dosya adı:** Referans veren kişinin adını kullan, örneğin `referans_ayse_yilmaz.pdf`.

---

## applications/

Geçmiş iş başvurularının kaydı. Her alt klasör bir başvuru.

Bu klasörleri elle de tutabilirsin, **`/outcome`** komutuna da bırakabilirsin: süreçteki gelişmeleri ve nihai sonucu sohbet ederek kaydeder, gönderdiğin taslakları ve ilan metnini arşivler, `outcome.md`'yi aşağıdaki formatta tutar ve aynı adımda `job_search_tracker.csv`'yi de günceller.

**Alt klasör adı:** `<company>_<role>`, küçük harfle, boşluklar yerine alt çizgi.

Örnekler:
```
applications/
├── acme_ml_engineer/
├── bigcorp_software_engineer/
└── consultco_ai_consultant/
```

### Her başvuru klasöründeki dosyalar

**`job_posting.md`**: İlanın tam metnini buraya yapıştır. `/setup` bunu hangi becerileri ve rol tiplerini hedeflediğini anlamak ve `04-job-evaluation.md`'yi kalibre etmek için kullanır.

**`cover_letter.tex`**: Gerçekten gönderdiğin ön yazı. `06-cover-letter-templates.md` için yazım tarzını ve yapıyı çıkarmakta kullanılır.

**`cv_draft.tex`**: Gönderdiğin CV versiyonu. `05-cv-templates.md` için profil özeti tarzlarını çıkarmakta kullanılır.

**`outcome.md`**: Başvuru sonuçlandıktan sonra doldur. Format aşağıda. Başlıklar ve durum değerleri komutlar tarafından okunduğu için İngilizce kalıyor, onları değiştirme; notlarını Türkçe yazabilirsin.

```markdown
# Outcome: <Company> — <Role>

**Status:** in_progress | hired | offer_declined | rejected | no_response | interview_only

**Date resolved:** YYYY-MM-DD

## Interview stages reached
- [ ] Phone screen
- [ ] Technical interview
- [ ] Case interview
- [ ] Final round
- [ ] Offer received

## Notes
What happened? What feedback did you receive (if any)?
What would you do differently?
Any signal about what they valued or didn't?
```

`in_progress`, hâlâ açık olan bir başvuruyu gösterir (`/outcome` bunu sonuç çıkmadan önceki mülakat aşaması güncellemeleri için kullanır). `/setup`'ın kalibrasyonu sadece nihai durumu belli olan başvurulardan sonuç çıkarır.

Başvuru klasörlerinde `/interview` komutunun yazdığı **`interview_prep_<stage>.md`** dosyaları da olabilir (her mülakat aşaması için bir tane, geçmiş olarak saklanır). `/setup` sadece yukarıdaki dört dosyayı okur, bunları görmezden gelir.

**`/setup` outcome.md'den neler öğrenir:**
- Hangi rol tipleri ve şirketler mülakata dönüştü (güçlü olduğun alanların sinyali)
- Hangi başvurular ilerlemedi (`04-job-evaluation.md`'deki deneyim eşleşmesi kalibrasyonunu besler)
- Mülakat geri bildirimlerini kaydettiysen bunlardan yeni STAR örnekleri çıkabilir

---

## Dosya Formatı Notları

| Format | `/setup` okuyabilir mi | Not |
|--------|--------------------------|-------|
| `.pdf` | Evet | Read aracıyla doğrudan okunur |
| `.tex` | Evet | LaTeX kaynağı, hem yapı hem içerik okunur |
| `.md` | Evet | Düz metin |
| `.txt` | Evet | Düz metin |
| `.docx` | Hayır | Buraya koymadan önce PDF'e çevir |
| `.png` / `.jpg` | Hayır | Taranmış belgeler okunmaz, metin içeren PDF kullan |

---

## `/setup`'ı Tekrar Çalıştırmak

Komut, belgelerin çoğaldıkça tekrar çalıştırılmak üzere tasarlandı. Her çalıştırmada:

1. Tüm skill dosyalarının mevcut halini okur
2. Belgelerden çıkardığı içeriği orada zaten olanla karşılaştırır
3. Sadece gerçekten yeni ya da çelişen içerik için değişiklik önerir
4. Hiçbir şeyin üzerine sessizce yazmaz, çelişkileri karar vermen için açıkça gösterir

**Ne zaman tekrar çalıştırmalısın:**
- Yeni bir LinkedIn dışa aktarımı ekledikten sonra
- Referans mektubu ekledikten sonra
- Biten başvuruların sonuçlarını kaydettikten sonra
- Ana CV'ni güncelledikten sonra
