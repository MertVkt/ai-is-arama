# Kurulum Rehberi

AI İş Arama'yı çalışır hale getirmek için adım adım talimatlar.

## 1. Gereksinimler

### Claude Code

macOS, Linux veya WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Homebrew (`brew install --cask claude-code`) ve WinGet (`winget install Anthropic.ClaudeCode`) ile de kurabilirsin. Kurulumdan sonra yeni bir terminal açıp `claude --version` ile kontrol et.

Bir Claude aboneliği (Pro, Max, Team veya Enterprise) ya da Claude Console hesabı gerekiyor. İlk açılışta tarayıcıdan giriş yapman istenir. Ayrıntılar: [Claude Code hızlı başlangıç](https://code.claude.com/docs/en/quickstart).

### Python

Maaş karşılaştırma aracı için Python 3.10+ gerekli:

```bash
python3 --version
```

Windows'ta Python'u python.org'dan kurarken **"Add python.exe to PATH"** kutusunu işaretle; Claude Code maaş aracını `python` komutuyla çalıştırıyor. Sisteminde Python `python3` değil de `python` olarak geçiyorsa aşağıdaki komutlarda `python` kullan.

### Bun (iş arama araçları için)

İş sitesi araçları TypeScript ile yazıldı ve Bun ile çalışıyor.

macOS / Linux:

```bash
curl -fsSL https://bun.sh/install | bash
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://bun.sh/install.ps1 | iex"
```

Windows'ta `winget install Oven-sh.Bun` da çalışır.

### LaTeX (özgeçmiş ve ön yazıyı PDF'e çevirmek için)

- **Windows:** [MiKTeX](https://miktex.org/download)
- **macOS:** [MacTeX](https://tug.org/mactex/)
- **Linux:** `sudo apt install texlive-full` veya `sudo dnf install texlive-scheme-full`

Özgeçmiş `lualatex` ile derlenir (yeni MiKTeX kurulumlarında `pdflatex` fontawesome5 hatası verebilir). Ön yazı `xelatex` ile derlenir, çünkü `cover.cls` kendi Lato ve Raleway fontlarını kullanıyor. Bu fontlar Türkçe karakterleri (ğ, ş, ı, İ) destekliyor.

#### Küçük TeX kurulumu: TinyTeX / BasicTeX

Tam dağıtımlar doğrudan çalışır. Küçük dağıtımlarda birkaç paket daha kurman gerekir. Aşağıdaki örnek macOS içindir ve `sudo` gerektirmez (diğer sistemler için [TinyTeX sayfasına](https://yihui.org/tinytex/) bak):

```bash
curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh -o /tmp/tinytex-install-bin-unix.sh
sh /tmp/tinytex-install-bin-unix.sh /tmp --no-path
export PATH="$HOME/Library/TinyTeX/bin/universal-darwin:$PATH"
```

Sonra şablonların ihtiyaç duyduğu paketler:

```bash
tlmgr install \
  moderncv fontawesome5 fontawesome6 academicons import luatexbase pgf \
  titlesec textpos xltxtra xunicode cite realscripts
```

Hızlı test:

```bash
(cd cv && lualatex -interaction=nonstopmode -halt-on-error main_example.tex)
(cd cover_letters && xelatex -interaction=nonstopmode -halt-on-error cover_example.tex)
```

İki komut da hatasız biterse ve `cv/main_example.pdf` 2 sayfa, `cover_letters/cover_example.pdf` 1 sayfa çıkarsa her şey yolunda.

### İsteğe bağlı: pdftotext (ATS kontrolü için)

`/apply`, özgeçmişin PDF'ini işe alım yazılımlarının (ATS) gördüğü şekilde okuyup iletişim bilgilerinin, okuma sırasının ve anahtar kelimelerin doğru çıktığını kontrol eder. Bunun için [poppler](https://poppler.freedesktop.org/) içindeki `pdftotext` gerekiyor:

- **macOS:** `brew install poppler`
- **Debian/Ubuntu:** `sudo apt install poppler-utils`
- **Windows:** `choco install poppler`

Yoksa `/apply` bu adımı uyarıyla atlar ve görsel kontrole geçer.

## 2. Fork'la ve indir

```bash
gh repo fork MertVkt/ai-is-arama --clone
cd ai-is-arama
```

Ya da GitHub'da **Fork** düğmesine basıp kendi kopyanı `git clone` ile indir. Fork'lamanın faydası şu: profilin, özgeçmişlerin ve başvuru takibin kendi reponda kalır. Kişisel bilgilerini herkese açık bir repoya göndermek istemiyorsan fork'unu **private** yap ya da repoyu indirip kendi bilgisayarında tut.

## 3. İş arama araçlarını kur

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

Bir aracın çalıştığını görmek için:

```bash
bun run .agents/skills/secretcv-search/cli/src/cli.ts search --help
```

## 4. Profilini oluştur

```bash
claude
```

Claude Code açılınca:

```
/setup
```

Üç yol var:

- **Belgeler klasörü (önerilen):** `documents/` altına özgeçmişini, LinkedIn profil PDF'ini, diplomalarını, referans mektuplarını koy. Claude hepsini okuyup çapraz kontrol eder ve profili gerçek belgelerden çıkarır. Yeni belge ekledikçe tekrar çalıştırabilirsin. Klasör düzeni `documents/README.md` içinde.
- **Tek özgeçmiş:** Özgeçmişini sohbete yapıştır veya `@` ile göster, eksikleri Claude sorar.
- **Sohbet:** Claude bölüm bölüm sorular sorar, sen kendi cümlelerinle anlatırsın.

### Neler doldurulur?

- `CLAUDE.md`: ana profil
- `.claude/skills/job-application-assistant/` altındaki 7 dosya: aday profili, çalışma tarzı, yazım üslubu, değerlendirme kriterleri, özgeçmiş ve ön yazı kuralları, mülakat örnekleri
- `.claude/skills/job-scraper/search-queries.md`: `/scrape` için arama sorguları
- `cv/main_example.tex`: ana özgeçmişin

### Sonradan güncelleme

Sadece arama ayarlarını değiştirmek için:

```
/setup --section search
```

## 5. İsteğe bağlı: Maaş karşılaştırma

Elinde maaş verisi varsa (kendi notların, aldığın teklifler, erişimin olan maaş anketleri, elle derlediğin rakamlar):

1. `salary_data.json` dosyasını elle oluştur (biçim `tools/README_SALARY_TOOL.md` içinde), ya da
2. Excel'den dönüştür:

   ```bash
   pip install openpyxl
   python3 tools/convert_salary_excel.py maaslar.xlsx --source "Kendi derlemem 2026" --label "Aylık brüt (TL)"
   ```

Bu adımı atlarsan `/apply` maaş karşılaştırmasını yapmaz, başka hiçbir şey etkilenmez.

## 6. İş akışını dene

```
/apply https://www.eleman.net/is-ilani/garson-i4802953
```

Kariyer.net ve Yenibiriş otomatik erişimi engellediği için o sitelerden beğendiğin ilanın metnini kopyalayıp yapıştır:

```
/apply <ilan metni>
```

Claude sırasıyla:
1. İlanın profiline uygunluğunu değerlendirir
2. Devam etmek isteyip istemediğini sorar
3. İlana özel özgeçmiş ve ön yazı taslağı hazırlar
4. İkinci bir ajana taslakları eleştirtir
5. Düzeltir, PDF'leri derleyip kontrol eder ve sana sunar

## 7. Belgeleri derle

`/apply` PDF'leri kendisi derler. Elle derlemek istersen:

```bash
(cd cv && lualatex main_<sirket>.tex)
(cd cover_letters && xelatex cover_<sirket>_<pozisyon>.tex)
```

PowerShell:

```powershell
Push-Location cv; lualatex main_<sirket>.tex; Pop-Location
Push-Location cover_letters; xelatex cover_<sirket>_<pozisyon>.tex; Pop-Location
```

Kendi LaTeX şablonunu kullanmak istersen `/add-template` komutunu çalıştır.

## Sorun giderme

### "salary_data.json not found"
Maaş verisi eklemediysen normal. `/apply` bu adımı otomatik atlar.

### İş arama araçları çalışmıyor
- Bun kurulu mu ve her araç klasöründe `bun install` çalıştırdın mı, kontrol et.
- Araçlar internete erişmek zorunda. Şirket ağı veya VPN bazı siteleri engelleyebilir.
- Bir site sayfa yapısını değiştirdiyse araç boş sonuç dönebilir veya hata verebilir. Hata mesajıyla birlikte issue açarsan düzeltilmesi kolaylaşır.
- Bir site "erişim engellendi" diyorsa araç bunu açıkça raporlar. Bu durumda bir süre bekle; engeli aşmaya çalışma.

### Kariyer.net / Yenibiriş linkini /apply'a verdim, çalışmadı
Beklenen durum. Bu siteler bot korumalı. Sayfayı tarayıcıda aç, ilan metnini kopyala, `/apply` ile yapıştır.

### LaTeX derleme hataları
- Özgeçmiş: `lualatex`
- Ön yazı: `xelatex`
- Dağıtımında `moderncv` paketi olduğundan emin ol

### Ön yazıda fontlar bulunamıyor
Şablon fontları `cover_letters/OpenFonts/fonts/` altında bekliyor. Bu klasörün ve içindeki Lato ve Raleway dosyalarının yerinde olduğundan emin ol.

### Ön yazıda ₺ işareti çıkmıyor
Raleway fontunda ₺ işareti yok. Tutarları "45.000 TL" şeklinde yaz.
