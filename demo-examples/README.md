# ShipGuard Demo Ornekleri

Bu klasor tekillestirilmis demo ciktisini icerir. Ayni turde tekrar eden dosyalar kaldirildi ve her senaryo icin tek bir ornek birakildi.

## Dahil Edilen Dosyalar

1. `example-output-clean.txt`
   Temiz proje icin `shipguard scan` cikti ornegi.

2. `example-output-with-issues.txt`
   Sorunlu proje icin `shipguard scan` cikti ornegi.

3. `example-output-json.json`
   `shipguard scan --json` cikti ornegi.

4. `example-ci-fail.txt`
   `shipguard scan --threshold 80` ile CI fail senaryosu.

5. `example-ai-review.txt`
   `shipguard ai-review` terminal cikti ornegi.

6. `example-ai-review.json`
   `shipguard ai-review --json` cikti ornegi.

7. `example-output-fix.txt`
   `shipguard fix` (patch onizleme) cikti ornegi.

8. `example-fix-json.json`
   `shipguard fix --json` cikti ornegi.

9. `fixture-vulnerable/`
   Demo ciktisi uretmek icin kullanilan kasitli zafiyetli fixture proje.

## Notlar

- Skor formulu: `score = 100 - (critical * 15 + medium * 6 + low * 2)`
- AI review komutu calismasi icin `OPENAI_API_KEY` gerekir.
- JSON dosyalari CI/CD entegrasyonu icin uygundur.
