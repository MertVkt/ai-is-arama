# Katkıda Bulunma

Katkı yapmayı düşündüğün için teşekkürler. Bu repo, Türkiye'de iş arayanların Claude Code ile başvuru sürecini yönetebilmesi için hazırlandı. Aşağıdaki kısa notlar, emeğinin boşa gitmemesi için.

## En çok işe yarayan katkılar

- **Yeni portal araçları.** Türkiye'de kullanılan ve otomatik erişime açık bir iş sitesi biliyorsan `/add-portal` ile bir arama aracı oluşturabilirsin. Sitenin `robots.txt` kurallarına uyması ve bot korumasını aşmaya çalışmaması şart.
- **Hata düzeltmeleri.** Bir portalın sayfa yapısı değiştiğinde araçlar bozulabilir. Hatayı nasıl tekrar ürettiğini yazarsan düzeltme çok daha hızlı gider.
- **Türkçe şablon ve metin iyileştirmeleri.** Özgeçmiş, ön yazı veya mülakat hazırlığı tarafında Türkiye'deki işe alım pratiğine daha uygun öneriler.
- **Belgelerdeki eksikler.** Kurulumda takıldığın bir yer olduysa, büyük ihtimalle başkası da takılıyordur.

## Kabul edilmeyenler

- **Kişisel profil verisi.** Şablonlar yer tutucularla gelir, senin doldurduğun profil kendi fork'unda kalır. CI bunu kontrol ediyor.
- **Bot korumasını aşan çözümler.** Captcha çözme, tarayıcı parmak izi taklidi, proxy rotasyonu gibi yöntemler. Kariyer.net ve Yenibiriş bu yüzden otomatik aranmıyor, bu bilinçli bir tercih.
- **Tek PR'da birden fazla konu.** Her PR tek bir şeyi çözsün, inceleme hızlı olsun.

## PR göndermeden önce

CI'ın çalıştırdıklarını yerelde de çalıştır:

```bash
python3 tools/lint_skills.py
python3 tools/security_guards.py
python3 -m unittest discover -s tests -t . -v
```

Değiştirdiğin her portal aracında:

```bash
cd .agents/skills/<portal>-search/cli
bun install && bun test && bun run typecheck
```

## Pratik notlar

- **Portal aracı sözleşmesi:** `search` ve `detail` komutları, `--format json|table|plain`, hatalar stderr'e JSON olarak ve çıkış kodu 1, 429/5xx durumlarında bekleyip yeniden deneme. Örnek olarak `secretcv-search` klasörüne bakabilirsin. (`linkedin-search` tarayıcı gibi görünen bir istemci kimliği kullanıyor, onu örnek alma.)
- **Kullanım sınırları:** Kullanım koşulları kısıtlayıcı olan kaynaklara (LinkedIn gibi) erişen araçlar yalnızca kişisel kullanım içindir ve CI hiçbir canlı portal isteği yapmaz. Bunu "düzeltmeye" çalışma.
- **Taban proje:** Bu repo, [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) projesinin Türkiye uyarlamasıdır. Türkiye'ye özgü olmayan, her ülkeye fayda sağlayacak bir iyileştirme yaptıysan onu asıl projeye de göndermeyi düşünebilirsin.
