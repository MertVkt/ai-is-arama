# Özel Şablonlar

Bu klasörde senin eklediğin LaTeX şablonları durur ve `/add-template` komutuyla yönetilir. Sistem kendi şablonlarıyla (özgeçmiş için moderncv, ön yazı için `cover.cls`) kurulumdan hemen sonra çalışır. Bu klasör ancak kendi şablonunu eklediğinde dolmaya başlar.

## Yapı

```
templates/
├── cv/
│   └── <template-name>/
│       ├── template.tex     # Kişiden bağımsız iskelet ([PLACEHOLDER] token'ları)
│       ├── TEMPLATE.md      # Manifest: derleme motoru, fontlar, sayfa sınırı, stil kuralları, dikkat edilecekler
│       ├── *.cls / *.sty    # Özel class/style dosyaları (şablon gerektiriyorsa)
│       └── fonts/           # Paketle gelen font dosyaları (sistem fontu kullanılmıyorsa)
└── cover_letters/
    └── <template-name>/
        └── (aynı yapı)
```

## Nasıl çalışır

- `/add-template` şablonun talimatlarını (derleme motoru, fontlar, stil kuralları, sayfa sınırı) sana sorarak öğrenir, dosyaları buraya kaydeder ve bir şey kaydetmeden önce mutlaka bir test derlemesi yapar.
- Bir şablonu etkinleştirdiğinde `05-cv-templates.md` ya da `06-cover-letter-templates.md` içine yönetilen bir blok eklenir. `/apply` taslak hazırlarken zaten bunu okuduğu için başka bir bağlantı kurmana gerek yok.
- `/add-template --list` kayıtlı şablonları listeler, `/add-template --use <name>` şablon değiştirir, `/add-template --use default` hazır şablonlara geri döner.

Şablonlar kişisel veri yerine `[PLACEHOLDER]` token'larıyla saklanır, yani commit etmek ve paylaşmak güvenli. Yine de şablon dosyalarına kendi bilgilerini (ad, telefon, adres gibi) elle yazdıysan commit etmeden önce kontrol et.
