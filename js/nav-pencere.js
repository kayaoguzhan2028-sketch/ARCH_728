/* Üst gezinme barını dar ekranlarda üç öğeye indirir.
   ------------------------------------------------------------------------
   SORUN
   Proje barları 2 ile 13 arasında link taşıyor (p1'de 11, p4'te 13). Telefon
   genişliğinde bunlar sığmıyor; bar yatayda kayıyor ama çubuğu gizli olduğu
   için kaydırılabildiği belli olmuyor, kullanıcı sayfanın yarısını hiç
   görmüyor.

   Ayrıca alt sayfalar `.nav-dropdown-menu` içinde ve menü yalnızca `:hover`
   ile açılıyor. Dokunmatikte hover yok — yani p1 ve p4'ün alt sayfalarına
   telefondan bar üzerinden ulaşmak mümkün değildi.

   ÇÖZÜM
   Dar ekranda dropdown düzleştiriliyor (alt sayfalar barın doğrudan öğesi
   oluyor, böylece erişilebilir hale geliyorlar) ve listeden yalnızca üç öğe
   gösteriliyor: önceki sayfa, bulunulan sayfa, sonraki sayfa. İlk sayfadaysa
   ilk üç, son sayfadaysa son üç.

   NEDEN JS
   Dropdown öğeleri iç içe bir <div> içinde, yani üst seviyedeki linklerle
   kardeş değiller. CSS'in kardeş seçicileri bu katmanı geçemediği için sıra
   hesabı JS'te yapılıyor. Gizleme yine CSS'e bırakılıyor (aşağıdaki stil).

   NEDEN TEK DOSYA
   52 sayfa bu barı taşıyor. Mantığı her birine kopyalamak, projede daha önce
   gövde opaklığında yaşanan dağılmanın aynısını üretirdi. Sayfalar bunu tek
   satırla çağırıyor; bump-version.sh yerel .js dosyalarını zaten
   versiyonladığı için önbellek sorunu da olmuyor. */

(function () {
  'use strict';

  var SINIR = 900;       // bu genişliğin altında pencere devreye girer
  var PENCERE = 3;       // aynı anda gösterilecek öğe sayısı

  /* Gizleme ve düzleştirme CSS'i buradan basılıyor ki sayfalara ayrıca
     stil eklemek gerekmesin — dosyayı çağırmak yetsin. */
  function stilBas() {
    if (document.getElementById('nav-pencere-stil')) return;
    var st = document.createElement('style');
    st.id = 'nav-pencere-stil';
    st.textContent =
      '@media (max-width:' + SINIR + 'px){' +
      /* display:contents — sarmalayıcılar kutu üretmeyi bırakır, çocukları
         barın doğrudan öğesi olur. Böylece dropdown açılmayı beklemeden
         görünür ve sıraya dahil olur. */
      '.nav-dropdown,.nav-dropdown-menu{display:contents;}' +
      /* Düzleşince alt sayfa linkleri üst seviyedekilerle aynı görünmeli;
         kendi küçük puntolarıyla kalırlarsa bar iki kademeli görünüyor. */
      '.nav-dropdown-menu a{font-size:inherit;opacity:inherit;}' +
      '.nav-center-links a[data-nav-gizli],.sub-nav a[data-nav-gizli]{display:none;}' +
      '}';
    document.head.appendChild(st);
  }

  function dosyaAdi(yol) {
    try {
      return decodeURIComponent(yol.split('/').pop().split('#')[0].split('?')[0]).toLowerCase();
    } catch (e) {
      return yol.split('/').pop().toLowerCase();
    }
  }

  function uygula() {
    var bar = document.querySelector('.nav-center-links, .sub-nav');
    if (!bar) return;

    var hepsi = Array.prototype.slice.call(bar.querySelectorAll('a[href]'));

    /* Aynı hedefe giden ilk link tutuluyor. Dropdown başlığı kendi menüsünün
       ilk öğesiyle aynı sayfaya gidiyor (bilerek: "Power Plant" başlığı ile
       menüdeki "The Timeline" aynı dosya). Tekrarı elemezsek üç kişilik
       pencerenin bir yerini aynı sayfa iki kez kaplardı. */
    var sira = [];
    var gorulen = {};
    hepsi.forEach(function (a) {
      var ad = dosyaAdi(a.getAttribute('href'));
      if (gorulen[ad]) return;
      gorulen[ad] = true;
      sira.push(a);
    });

    // Geniş ekran ya da zaten sığıyorsa: hiçbir şey gizleme.
    if (window.innerWidth > SINIR || sira.length <= PENCERE) {
      hepsi.forEach(function (a) { a.removeAttribute('data-nav-gizli'); });
      return;
    }

    /* Bulunulan sayfa: adres çubuğundaki dosya adıyla eşleşen link. `.active`
       sınıfına bakmıyoruz çünkü dropdown'lu sayfalarda iki tane işaretli
       oluyor (hem menü başlığı hem içindeki güncel sayfa) ve hangisinin
       gerçek konum olduğu oradan anlaşılmıyor. */
    var simdi = dosyaAdi(location.pathname) || 'index.html';
    var i = -1;
    for (var k = 0; k < sira.length; k++) {
      if (dosyaAdi(sira[k].getAttribute('href')) === simdi) { i = k; break; }
    }
    if (i === -1) i = 0;   // sayfa listede yoksa baştan göster

    /* Pencere: ortada bulunulan sayfa. Başta ve sonda kayıyor ki her zaman
       tam üç öğe görünsün — ilk sayfada "önceki" yok, o yüzden sonraki iki
       sayfa gösteriliyor; son sayfada tersi. */
    var bas = i - 1;
    if (bas < 0) bas = 0;
    if (bas > sira.length - PENCERE) bas = sira.length - PENCERE;

    hepsi.forEach(function (a) { a.setAttribute('data-nav-gizli', ''); });
    for (var j = bas; j < bas + PENCERE; j++) {
      sira[j].removeAttribute('data-nav-gizli');
    }
  }

  function baslat() {
    stilBas();
    uygula();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslat);
  } else {
    baslat();
  }

  /* Ekran döndürüldüğünde ya da pencere boyutu değiştiğinde yeniden hesapla:
     yatayda sığan bar dikeyde sığmayabiliyor. */
  var bekle;
  window.addEventListener('resize', function () {
    clearTimeout(bekle);
    bekle = setTimeout(uygula, 150);
  });
})();
