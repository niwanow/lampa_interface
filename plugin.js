/*
 * my-interface.js 1.1.0 — самостоятельный интерфейс Lampa: главный экран, страница фильма и сериала,
 * страницы «Еще», «История», «Избранное», тёмная тема.
 *
 * Заменяет связку «Стильный интерфейс» (Igorek1986) + int-addon.js: после установки в Lampa остаётся один
 * плагин. Только собственный код; синтаксис ES5 (старые ТВ). Без телеметрии и обфускации.
 * Внешние адреса — только те, что в SPEC.md (TMDB — через Lampa.TMDB).
 *
 * Описание и проверка каждой правки — SPEC.md; номера совпадают с EDITS.md (int-addon.js):
 *   ПРАВКА 1  — трейлер по кругу на странице фильма (на главном экране трейлеров нет — по просьбе)
 *   ПРАВКА 2  — стеклянный фокус карточек
 *   ПРАВКА 3  — смена баннера в сторону нажатия; старое содержимое плавно уходит
 *   ПРАВКА 5  — без значка «уже начинали смотреть»
 *   ПРАВКА 6  — страница фильма в стиле баннера; у сериала ряды «Эпизоды → Похожие → Актёры»; без
 *               «Рекомендаций», «Подробно», «Комментариев» и кнопок «Трейлер», (i), «•••»
 *   ПРАВКА 7  — рейтинги IMDb, TMDB, Кинопоиск, Rotten Tomatoes, CUB (только на странице фильма)
 *   ПРАВКА 8  — метка «Фильм» / «Сериал»
 *   ПРАВКА 9  — строка «жанры ● год, страна ● Сезонов N ● статус», цветной статус (сплошная заливка)
 *   ПРАВКА 10 — шрифт SF Pro, загруженный с компьютера по домашней сети
 *   ПРАВКА 11 — карточки по образцу: три в ряд с нахлёстом, логотип на кадре; ряды; плитка «Еще»
 *   ПРАВКА 12 — страницы «Еще», «История», «Избранное»: широкие плитки с подписью, по три в ряд
 *   ПРАВКА 13 — шапка спрятана на главном, «Фильмах», «Сериалах», жанрах и странице фильма; по «вверх» — видна
 *   ПРАВКА 14 — яркий фон с затемнением, на своих слоях
 *   ПРАВКА 15 — свой баннер главного экрана и встраивание в Lampa (вместо «Стильного интерфейса»):
 *               один запрос TMDB на карточку, общий ограниченный кэш
 *   ПРАВКА 16 — тёмная тема: чёрный фон вместо размытого кадра, тёмные меню и панели
 *   ПРАВКА 17 — значки закладок («Избранное», «Нравится», «Позже») в правом нижнем углу карточки
 * Правка 4 убрана (кнопки звука на главном нет — звук в настройках).
 */
(function () {
    'use strict';

    // ОБЩЕЕ: защита от повторной загрузки — стили и обработчики не дублируются.
    if (window.my_interface_ready) return;
    window.my_interface_ready = true;

    var VERSION = '1.1.0';
    var TAG = '[my-interface]';
    var warned = {};

    function warnOnce(n, text) {
        if (warned[n + text]) return;
        warned[n + text] = true;
        try { console.warn(TAG + ' ПРАВКА ' + n + ': ' + text); } catch (e) {}
    }

    function info(text) {
        try { console.log(TAG + ' ' + text); } catch (e) {}
    }

    // ---------------------------------------------------------------------------------------
    // ОБЩЕЕ: мелкие помощники
    // ---------------------------------------------------------------------------------------

    function opt(name, def) {
        var v;
        try { v = Lampa.Storage.get(name, def); } catch (e) { return def; }
        if (v === 'true') return true;
        if (v === 'false') return false;
        if (v === '' || v === null || typeof v === 'undefined') return def;
        return v;
    }

    function hasCls(el, cls) {
        return !!(el && el.classList && el.classList.contains(cls));
    }

    function closestCls(node, cls) {
        while (node && node.nodeType === 1) {
            if (node.classList && node.classList.contains(cls)) return node;
            node = node.parentNode;
        }
        return null;
    }

    function make(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined && text !== null) el.textContent = String(text);
        return el;
    }

    function inDoc(el) {
        return !!(el && document.body && document.body.contains(el));
    }

    function isTv(data) {
        return !!(data && (data.media_type === 'tv' || data.name || data.original_name || data.first_air_date));
    }

    function mediaType(data) {
        return isTv(data) ? 'tv' : 'movie';
    }

    function tmdbLang() {
        var l = opt('tmdb_lang', '') || opt('language', 'ru');
        return String(l || 'ru');
    }

    // Источники карточек, у которых id — это id TMDB (как у оригинала): tmdb, cub, NUMParser.
    function sourceOk(data) {
        if (!data || !data.id) return false;
        var s = data.source || 'tmdb';
        return s === 'tmdb' || s === 'cub' || s === 'NUMParser';
    }

    function capFirst(s) {
        s = String(s || '');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function yearOf(data) {
        return String((data && (data.release_date || data.first_air_date)) || '').slice(0, 4);
    }

    // Обёртка метода модуля Lampa: оригинал вызывается с тем же this и аргументами, результат возвращается.
    function wrap(obj, name, fn) {
        if (!obj) return false;
        var orig = typeof obj[name] === 'function' ? obj[name] : null;
        obj[name] = function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.call(this, orig, args);
        };
        return true;
    }

    function callOrig(orig, self, args) {
        return orig ? orig.apply(self, args) : undefined;
    }

    // Кэш «словарь + порядок вставки» в localStorage с ограничением размера (старые вытесняются).
    // Тот же формат, что у int-addon.js: { o: [порядок ключей], m: { ключ: значение } }.
    function LimitedStore(key, limit) {
        this.key = key;
        this.limit = limit;
        this.data = null;
        this.timer = null;
    }
    LimitedStore.prototype.load = function () {
        if (this.data) return;
        var obj = null;
        try { obj = JSON.parse(window.localStorage.getItem(this.key) || 'null'); } catch (e) { obj = null; }
        this.data = (obj && obj.m && obj.o) ? obj : { o: [], m: {} };
    };
    LimitedStore.prototype.get = function (id) {
        this.load();
        return Object.prototype.hasOwnProperty.call(this.data.m, id) ? this.data.m[id] : undefined;
    };
    LimitedStore.prototype.set = function (id, value) {
        this.load();
        if (!Object.prototype.hasOwnProperty.call(this.data.m, id)) this.data.o.push(id);
        this.data.m[id] = value;
        while (this.data.o.length > this.limit) delete this.data.m[this.data.o.shift()];
        var self = this;
        clearTimeout(this.timer);
        this.timer = setTimeout(function () {
            try { window.localStorage.setItem(self.key, JSON.stringify(self.data)); } catch (e) {}
        }, 1500);
    };

    function tmdbImage(path, size) {
        path = String(path || '').replace('.svg', '.png');
        if (!path) return '';
        try {
            if (Lampa.TMDB && typeof Lampa.TMDB.image === 'function') return Lampa.TMDB.image('/t/p/' + size + path);
        } catch (e) {}
        try { return Lampa.Api.img(path, size); } catch (e2) { return ''; }
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 15: данные фильма — ОДИН запрос TMDB на карточку (детали + логотипы + ролики + внешние id),
    // общий кэш с ограничением, без повторных запросов одного и того же фильма.
    // ---------------------------------------------------------------------------------------

    var INFO_TTL = 3 * 24 * 3600 * 1000;           // статус и сезоны меняются — через 3 дня спросим снова
    var LOGO_NONE_TTL = 7 * 24 * 3600 * 1000;      // «логотипа нет» помним неделю
    var infoStore = new LimitedStore('my_info_cache', 300);
    var logoStore = new LimitedStore('my_logo_cache', 500);      // формат int-addon.js: адрес w300 или 'none:<время>'

    var NET_QUEUE_MAX = 12;           // заданий в очереди; лишние подготовки соседей (самые старые) снимаются
    var NET_FAIL_PAUSE = 60 * 1000;   // после ошибки этот фильм минуту не спрашиваем
    var Net = { active: 0, max: 2, list: [], pending: {}, queued: {}, failed: {}, failedN: 0 };

    function netPump() {
        while (Net.active < Net.max && Net.list.length) {
            var job = Net.list.shift();
            delete Net.queued[job.id];
            Net.active++;
            netRun(job);
        }
    }

    // Задание освобождает место в очереди ровно один раз — даже если запрос бросил исключение.
    function netRun(job) {
        var over = false;
        var done = function () {
            if (over) return;
            over = true;
            Net.active--;
            setTimeout(netPump, 0);
        };
        try { job.run(done); } catch (e) { job.fail(); done(); }
    }

    // Снять из очереди задания, пока их больше keep: сначала несрочные (подготовка соседей, самые старые), потом,
    // если withHigh, — самые старые срочные (карточки, мимо которых уже пролистали). Ждущие получают «нет данных».
    function netTrim(keep, withHigh) {
        var i = 0, job;
        while (i < Net.list.length && Net.list.length > keep) {
            job = Net.list[i];
            if (job.high) { i++; continue; }
            Net.list.splice(i, 1);
            delete Net.queued[job.id];
            job.resolve(null);
        }
        for (var k = Net.list.length - 1; withHigh && k >= 0 && Net.list.length > keep; k--) {
            job = Net.list.splice(k, 1)[0];
            delete Net.queued[job.id];
            job.resolve(null);
        }
    }

    function netFailed(id) {
        var t = Net.failed[id];
        if (!t) return false;
        if (Date.now() - t < NET_FAIL_PAUSE) return true;
        delete Net.failed[id];
        Net.failedN--;
        return false;
    }

    function netMarkFailed(id) {
        if (Net.failedN >= 100) { Net.failed = {}; Net.failedN = 0; }
        if (!Net.failed[id]) Net.failedN++;
        Net.failed[id] = Date.now();
    }

    function pickLogoPath(logos) {
        if (!logos || !logos.length) return '';
        var lang = tmdbLang().slice(0, 2);
        var order = [lang, 'en', null];
        for (var o = 0; o < order.length; o++) {
            for (var i = 0; i < logos.length; i++) {
                if (logos[i] && logos[i].file_path && (logos[i].iso_639_1 || null) === order[o]) return logos[i].file_path;
            }
        }
        return logos[0].file_path || '';
    }

    // Ролики YouTube от лучшего к худшему: трейлер, потом тизер; язык интерфейса, потом английский; официальный.
    function rankTrailers(results) {
        var list = [];
        var lang = tmdbLang().slice(0, 2);
        for (var i = 0; results && i < results.length; i++) {
            var v = results[i];
            if (!v || !v.key || String(v.site).toLowerCase() !== 'youtube' || trailerBad[v.key]) continue;
            var s = 0;
            if (v.type === 'Trailer') s += 100;
            else if (v.type === 'Teaser') s += 50;
            else s += 5;
            if (v.iso_639_1 === lang) s += 30;
            else if (v.iso_639_1 === 'en') s += 15;
            if (v.official) s += 5;
            if (v.size >= 1080) s += 2;
            list.push({ k: v.key, s: s, i: i });
        }
        list.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
        var keys = [];
        for (var j = 0; j < list.length; j++) keys.push(list[j].k);
        return keys;
    }

    function pickTrailer(results) {
        return rankTrailers(results)[0] || '';
    }

    // Компактная запись (только нужные поля; полный ответ TMDB не храним).
    function compactInfo(json, data) {
        var genres = [];
        var gs = json.genres || [];
        for (var i = 0; i < gs.length && genres.length < 2; i++) if (gs[i] && gs[i].name) genres.push(capFirst(gs[i].name));
        var countries = [];
        try { countries = (Lampa.Api.sources.tmdb.parseCountries(json) || []).slice(0, 2); } catch (e) { countries = []; }
        var logo = pickLogoPath(json.images && json.images.logos);
        var trailers = rankTrailers(json.videos && json.videos.results).slice(0, 3);
        return {
            t: Date.now(),
            g: genres,
            y: yearOf(json) || yearOf(data),
            c: countries,
            s: json.number_of_seasons || 0,
            st: json.status || '',
            o: String(json.overview || '').slice(0, 400),   // в баннере три строки; полный текст в localStorage не храним
            lg: logo,
            tr: trailers[0] || '',
            ts: trailers,                     // запасные ролики: если YouTube не даст встроить первый
            im: (json.external_ids && json.external_ids.imdb_id) || json.imdb_id || ''
        };
    }

    function infoId(data) {
        return mediaType(data) + '_' + data.id + '_' + tmdbLang().slice(0, 2);
    }

    function cachedInfo(data) {
        if (!sourceOk(data)) return null;
        var rec = infoStore.get(infoId(data));
        return (rec && Date.now() - rec.t < INFO_TTL) ? rec : null;
    }

    // high = true — для выбранной карточки: вперёд очереди.
    function getInfo(data, cb, high) {
        if (!sourceOk(data) || data.adult) { cb(null); return; }
        var id = infoId(data);
        var rec = cachedInfo(data);
        if (rec) { cb(rec); return; }
        if (Net.pending[id]) {
            Net.pending[id].push(cb);
            if (high && Net.queued[id]) {           // уже в очереди с низким приоритетом — поднимаем
                var job = Net.queued[id];
                job.high = true;
                var at = Net.list.indexOf(job);
                if (at > 0) { Net.list.splice(at, 1); Net.list.unshift(job); }
            }
            return;
        }
        if (netFailed(id)) { cb(null); return; }
        if (!Lampa.TMDB || typeof Lampa.TMDB.api !== 'function' || typeof Lampa.TMDB.key !== 'function' || !Lampa.Reguest) {
            warnOnce(15, 'нет Lampa.TMDB / Lampa.Reguest — баннер без деталей');
            cb(null);
            return;
        }
        Net.pending[id] = [cb];
        var type = mediaType(data);
        var lang = tmdbLang();
        var l2 = lang.slice(0, 2);
        var job = {
            id: id,
            high: !!high,
            resolve: function (rec) {
                var cbs = Net.pending[id] || [];
                delete Net.pending[id];
                for (var i = 0; i < cbs.length; i++) { try { cbs[i](rec); } catch (e) {} }
            },
            fail: function () { netMarkFailed(id); job.resolve(null); },
            run: function (done) {
                var url = Lampa.TMDB.api(type + '/' + data.id + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang +
                    '&append_to_response=images,videos,external_ids&include_image_language=' + l2 + ',en,null&include_video_language=' + l2 + ',en,null');
                var net = new Lampa.Reguest();
                try { net.timeout(10000); } catch (e) {}
                net.silent(url, function (json) {
                    if (!json || !json.id) { job.fail(); done(); return; }
                    var rec = compactInfo(json, data);
                    infoStore.set(id, rec);
                    logoStore.set(id, rec.lg ? tmdbImage(rec.lg, 'w300') : ('none:' + Date.now()));
                    job.resolve(rec);
                    done();
                }, function () { job.fail(); done(); });
            }
        };
        Net.queued[id] = job;
        if (high) Net.list.unshift(job);
        else Net.list.push(job);
        netTrim(NET_QUEUE_MAX, true);
        netPump();
    }

    // Логотип для карточки без запроса: из кэша (адрес w300), '' — «нет», undefined — неизвестно.
    function knownLogo(data) {
        var v = logoStore.get(infoId(data));
        if (typeof v === 'string' && v.indexOf('none') === 0) {
            var when = parseInt(v.split(':')[1], 10) || 0;
            return (Date.now() - when < LOGO_NONE_TTL) ? '' : undefined;
        }
        if (v) return v;
        var rec = cachedInfo(data);
        if (rec) return rec.lg ? tmdbImage(rec.lg, 'w300') : '';
        return undefined;
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 9: статус — цвет и понятные слова (по коду статуса TMDB)
    // ---------------------------------------------------------------------------------------

    function statusLook(code, tv) {
        code = String(code || '').toLowerCase();
        if (code === 'released') return ['green', 'Вышел'];
        if (code === 'ended') return ['green', 'Завершён'];
        if (code === 'returning series') return ['blue', 'В процессе'];
        if (code === 'in production' || code === 'pilot') return tv ? ['orange', 'Снимается'] : ['red', 'Не вышел'];
        if (code === 'post production' || code === 'planned' || code === 'rumored') return ['red', 'Не вышел'];
        if (code === 'canceled') return ['red', 'Закрыт'];
        return null;
    }

    // ---------------------------------------------------------------------------------------
    // Стили
    // ---------------------------------------------------------------------------------------

    function buildCss() {
        var c = [];
        var HOME = '.my-home';

        // ПРАВКА 15: свой баннер. Высота 23em и текст, прижатый к низу, — по правке 11 (ряды остаются на своих местах).
        // Текст — колонка: название или логотип (одна строка) → строка деталей → описание до трёх строк.
        c.push(HOME + '{position:relative}');
        c.push('.my-banner{position:relative;height:23em;z-index:1}');
        c.push('.my-banner__body{position:absolute;left:1.5em;right:18%;bottom:0;pointer-events:none}');
        c.push('.my-banner__title{font-size:3.8em;font-weight:600;line-height:1.35;margin-bottom:0.28em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
        c.push('.my-banner__logo{display:block;height:1.1em;width:auto;max-width:100%;object-fit:contain;object-position:left bottom}');
        c.push('.my-banner__title.my-wait{visibility:hidden;height:1.1em}');   // ждём логотип: место его высоты, пусто
        c.push('.my-banner__logo.my-fade-in{animation:my-fade-in 300ms linear}');
        c.push('@keyframes my-fade-in{0%{opacity:0}100%{opacity:1}}');
        c.push('.my-banner__details{display:flex;flex-wrap:wrap;align-items:center;font-size:1.25em;min-height:2.3em;margin-bottom:1.65em}');
        c.push('.my-banner__split{padding:0 0.9em;font-size:0.75em}');
        c.push('.my-banner__pg{display:inline-block;font-size:0.9em;line-height:1.3;padding:0.08em 0.45em;border:0.08em solid rgba(255,255,255,.85);border-radius:0.3em}');
        c.push('.my-banner__descr{font-size:1.35em;font-weight:300;line-height:1.36;max-width:34em;overflow:hidden;' +
            'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}');

        // ПРАВКА 9: цветной статус — в строке баннера и в строке страницы фильма. Сплошная насыщенная заливка и
        // белый полужирный текст: на ярком кадре полупрозрачная «таблетка» сливалась с фоном (просьба 14.11.2026).
        // Цвета темнее системных, чтобы белый текст читался (контраст не ниже ~4:1).
        var STS = ['.my-banner__details', '.my-hero-meta'];
        var ST = function (tail) { return multi(STS, '.my-status' + tail); };
        c.push(ST('') + '{display:inline-block;font-size:0.9em;font-weight:600;color:#fff;border:0.08em solid transparent;border-radius:1em;padding:0.12em 0.7em;line-height:1.35}');
        c.push(ST('--green') + '{background:#178a40}');
        c.push(ST('--blue') + '{background:#0a66c8}');
        c.push(ST('--orange') + '{background:#c25f00}');
        c.push(ST('--red') + '{background:#c8352b}');
        // Без цвета — тёмная непрозрачная «таблетка» с белой рамкой (тоже видна на любом кадре).
        c.push(multi(['body:not(.my-on-status) .my-banner__details', 'body:not(.my-on-status) .my-hero-meta'], '.my-status') + '{background:rgba(0,0,0,.72);border-color:rgba(255,255,255,.75)}');

        // ПРАВКА 14: фон — два кадра для плавной смены, затемнение слева и снизу; всё на своих слоях
        // (will-change + translateZ): иначе непрозрачный кадр перерисовывается при каждом движении (~100 мс на кадр).
        c.push('.my-bg{position:absolute;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none}');
        c.push('.my-bg__img{position:absolute;left:0;top:-4.4em;width:100%;height:calc(100% + 4.4em);object-fit:cover;opacity:0;' +
            'will-change:opacity;-webkit-transform:translateZ(0);transform:translateZ(0);transition:opacity 600ms cubic-bezier(.4,0,.2,1)}');
        c.push('.my-bg__img.my-bg__img--on{opacity:1}');
        c.push('body:not(.my-on-bright) .my-bg__img.my-bg__img--on{opacity:.5}');
        c.push('.my-bg::after{content:"";position:absolute;left:0;right:0;top:-4.4em;bottom:0;z-index:1;pointer-events:none;' +
            'will-change:transform;-webkit-transform:translateZ(0);transform:translateZ(0);' +
            'background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.4) 40%,rgba(0,0,0,0) 66%),linear-gradient(0deg,rgba(0,0,0,.92) 0%,rgba(0,0,0,.5) 34%,rgba(0,0,0,0) 58%)}');
        c.push('body:not(.my-on-bright) .my-bg::after{display:none}');

        // ПРАВКА 3: смена баннера в сторону нажатия (640 мс, лёгкий перелёт); старое содержимое уходит
        // в ту же сторону и гаснет (260 мс). Две копии анимации — перезапуск без пересчёта раскладки.
        var dirs = { r: '-1.6em,0', l: '1.6em,0', d: '0,-1em', u: '0,1em' };
        var outs = { r: '1.6em,0', l: '-1.6em,0', d: '0,1em', u: '0,-1em' };
        for (var d in dirs) {
            if (!Object.prototype.hasOwnProperty.call(dirs, d)) continue;
            var ab = ['a', 'b'];
            for (var k = 0; k < ab.length; k++) {
                var name = 'my-in-' + d + '-' + ab[k];
                c.push('@keyframes ' + name + '{0%{opacity:0;transform:translate3d(' + dirs[d] + ',0)}100%{opacity:1;transform:translate3d(0,0,0)}}');
                c.push('body.my-motion .my-banner__body.' + name + '{animation:' + name + ' 640ms cubic-bezier(.333,1.333,.667,1)}');
            }
            c.push('@keyframes my-out-' + d + '{0%{opacity:1;transform:translate3d(0,0,0)}100%{opacity:0;transform:translate3d(' + outs[d] + ',0)}}');
            c.push('.my-banner__ghost.my-out-' + d + '{animation:my-out-' + d + ' 260ms cubic-bezier(.4,0,1,1) forwards}');
        }
        c.push('body.no--animation .my-banner__body,body.no--animation .my-banner__ghost{animation:none!important}');
        c.push('body.no--animation .my-banner__ghost{display:none}');

        // ПРАВКА 11: карточки по образцу — ровно три карточки на экран между отступами ряда (1.5em),
        // промежуток 0.38em; логотип на кадре (нет логотипа — название крупным текстом). Промежуток Lampa
        // (.mapping--line > * + *, 1em) заменяем.
        // Ряды главного экрана, «Похожие» на странице фильма (правка 6) и ряды «Избранного» (правка 12) — одинаково.
        var W = 'body.my-caps ' + HOME + ' ';
        var ROWS = ['body.my-caps ' + HOME, 'body.my-hero .my-full', '.my-book'];
        var R = function (tail) { return multi(ROWS, tail); };
        c.push(HOME + ' .card.card--wide{width:18em}');
        c.push(R('.card.card--wide') + '{width:calc((100vw - 3.76em) / 3);margin-right:0}');
        c.push(R('.mapping--line > .card.card--wide + *') + '{margin-left:0.38em}');
        c.push(HOME + ' .card__promo,' + HOME + ' .card.card--wide .card-watched,body.my-hero .my-full .card .card__promo,' +
            '.my-book .card .card__promo,.my-book .card .card-watched{display:none!important}');
        c.push(R('.card .card__vote') + '{display:none!important}');
        // Плитка «Еще» в конце ряда — размером с карточку, «стекло», растёт влево, как последняя карточка.
        c.push(R('.mapping--line > .card-more') + '{width:calc((100vw - 3.76em) / 3)!important;margin-right:0}');
        c.push(R('.card-more .card-more__box') + '{height:auto!important;padding-bottom:56.25%!important;border-radius:0.55em;box-sizing:border-box;' +
            'background:linear-gradient(160deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,.07) 45%,rgba(255,255,255,.1) 100%)!important;border:0.07em solid rgba(255,255,255,.22);' +
            '-webkit-transform-origin:100% 50%;transform-origin:100% 50%;transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(R('.card-more.focus .card-more__box') + '{background:linear-gradient(160deg,rgba(255,255,255,.32) 0%,rgba(255,255,255,.12) 45%,rgba(255,255,255,.16) 100%),rgba(34,34,38,.94)!important}');
        c.push(R('.card-more .card-more__title') + '{color:#fff!important;font-weight:500}');
        c.push(R('.card-more .card-more__title::after') + '{content:"\\203A";margin-left:0.3em;opacity:.8}');
        c.push(R('.card-more.focus') + '{position:relative;z-index:3}');
        c.push(R('.card-more.focus .card-more__box') + '{-webkit-transform:scale(1.08);transform:scale(1.08);transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');
        c.push(R('.card-more.focus .card-more__box::after') + '{top:0;left:0;right:0;bottom:0;box-sizing:border-box;border:0.16em solid #fff;border-radius:0.55em;z-index:1}');
        // Lampa ставит выбранную карточку в центр ряда — по краям выглядывали бы соседние. Окно ряда уже на
        // 1.5em − 2px с каждой стороны, внутренний отступ — целые 2px (Lampa читает его через parseInt).
        // Сверху и снизу — запас 1.2em под увеличенную карточку (отрицательный отступ его компенсирует).
        c.push(R('.items-line .scroll--horizontal') + '{margin:-1.2em calc(1.5em - 2px);overflow:hidden}');
        c.push(R('.items-line .scroll--horizontal > .scroll__content') + '{padding:1.2em 2px}');
        // Заголовки рядов без значков (🔥, 🏆) и без маленькой кнопки «Еще» — все ряды одной высоты.
        c.push(W + '.items-line__title .full-person__photo{display:none!important}');
        c.push(W + '.items-line__title .full-person{font-size:1em;padding:0;background:none!important;color:inherit!important}');
        c.push(W + '.items-line__title .full-person__name{font-size:1em}');
        c.push(W + '.items-line__more{display:none!important}');
        // Логотип или название на кадре карточки.
        c.push('.my-card-logo{position:absolute;left:0.9em;bottom:0.9em;max-width:55%;max-height:42%;object-fit:contain;object-position:left bottom;z-index:1;pointer-events:none}');
        c.push('.my-card-shade{position:absolute;left:0;right:0;bottom:0;height:55%;z-index:0;pointer-events:none;border-radius:0 0 0.55em 0.55em;background:linear-gradient(0deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,0) 100%)}');
        c.push('.my-card-name{position:absolute;left:0.75em;right:26%;bottom:0.7em;z-index:1;pointer-events:none;color:#fff;font-weight:700;font-size:1.7em;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}');
        // Подпись «название / жанры / год» — под карточками «Похожих» (правка 6) и страницы «Еще» (правка 12).
        c.push('.my-cap{padding:0.5em 0.2em 0}');
        c.push('.my-cap__title{font-size:1.15em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
        c.push('.my-cap__genres,.my-cap__year{font-size:0.95em;line-height:1.25;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');

        buildCssStage2(c);
        return c.join('\n');
    }

    function multi(scopes, tail) {
        var out = [];
        for (var i = 0; i < scopes.length; i++) out.push(scopes[i] + ' ' + tail);
        return out.join(',');
    }

    // Где карточки оформлены по образцу: главный экран, страница фильма, страницы «Еще» и «История» (сетка),
    // «Избранное» (ряды).
    var CARD_SCOPES = ['.my-home', '.my-full', '.my-cat', '.my-book'];

    function scoped(flag, tail) {
        var out = [];
        for (var i = 0; i < CARD_SCOPES.length; i++) out.push(flag + ' ' + CARD_SCOPES[i] + ' ' + tail);
        return out.join(',');
    }

    function buildCssStage2(c) {
        var G = 'body.my-glass';
        // ПРАВКА 2: стеклянный фокус. Выбранная карточка ×1.08 (260 мс с лёгким перелётом, назад 180 мс — как в
        // лаунчере CleanYourTV), белая рамка прямо по краю кадра, блик сверху. Только transform и opacity.
        c.push(scoped(G, '.card .card__view') + '{transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(scoped(G, '.card.focus') + '{z-index:3}');
        c.push(scoped(G, '.card.focus .card__view') + '{-webkit-transform:scale(1.08);transform:scale(1.08);transition:transform 260ms cubic-bezier(.333,1.533,.667,1);animation:none!important}');
        // Крайние карточки ряда растут внутрь экрана: первая — вправо, последняя — влево (ряд обрезан, правка 11).
        c.push(scoped(G, '.card:first-child .card__view') + '{-webkit-transform-origin:0 50%;transform-origin:0 50%}');
        c.push(scoped(G, '.card:last-child .card__view') + '{-webkit-transform-origin:100% 50%;transform-origin:100% 50%}');
        c.push(scoped(G + '.no--animation', '.card .card__view') + '{transition:none!important}');
        // Рамка Lampa (::after) — тонкая белая линия по краю кадра вместо толстой рамки с отступом снаружи.
        c.push(scoped(G, '.card.focus .card__view::after') + ',' + scoped(G, '.card.hover .card__view::after') +
            '{top:0;left:0;right:0;bottom:0;box-sizing:border-box;border:0.16em solid #fff;border-radius:0.55em;z-index:3}');
        c.push(scoped(G, '.card .card__view') + ',' + scoped(G, '.card .card__img') + '{border-radius:0.55em}');
        c.push(scoped(G, '.card .card__view::before') +
            '{content:"";position:absolute;left:0;top:0;right:0;bottom:0;border-radius:0.55em;z-index:2;pointer-events:none;opacity:0;' +
            'transition:opacity 150ms linear;box-sizing:border-box;border:0.07em solid rgba(255,255,255,.45);' +
            'background:linear-gradient(160deg,rgba(255,255,255,.3) 0%,rgba(255,255,255,.08) 28%,rgba(255,255,255,0) 50%,rgba(255,255,255,0) 80%,rgba(255,255,255,.1) 100%)}');
        c.push(scoped(G, '.card.focus .card__view::before') + '{opacity:1}');

        // ПРАВКА 5: без значка «уже начинали смотреть».
        c.push('body.my-hide-play .card__icon.icon--history{display:none!important}');

        // ПРАВКА 8: метка «Фильм» / «Сериал» в правом верхнем углу — одинаковая тёмная «таблетка» вместо красной «TV».
        // Отступ справа 1.2em: выбранная карточка, наезжая на соседнюю слева, метку не режет.
        var L = 'body.my-type-label';
        var LG = 'body.my-type-label.my-glass';   // метка + стеклянный фокус (соседняя метка отъезжает)
        c.push(L + ' .card .card__type{display:none!important}');
        c.push(L + ' .card:not(.card--collection) .card__view .card__icons::before{content:"Фильм";position:absolute;left:auto;right:1.2em;top:-0.35em;' +
            'padding:0.3em 0.8em;border-radius:1em;font-size:0.9em;line-height:1.2;color:#fff;white-space:nowrap;' +
            'background:rgba(18,18,22,.58);border:0.08em solid rgba(255,255,255,.35);transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(L + ' .card.card--tv .card__view .card__icons::before{content:"Сериал"}');
        // Выбранная последняя карточка или плитка «Еще» растёт влево и закрывает правый край предыдущей — метка
        // предыдущей на это время отъезжает влево.
        c.push(LG + ' .card:has(+ .card:last-child.focus) .card__view .card__icons::before,' +
            LG + ' .card:has(+ .card-more.focus) .card__view .card__icons::before{-webkit-transform:translateX(-2em);transform:translateX(-2em);transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');

        // ПРАВКА 1: слой трейлера. iframe 640×360 растягивается transform-ом (мост Lampa просит у YouTube картинку по
        // размеру окна — так это ~720p, а не 4K). Затемнение — то же, что у кадра фона (без скачка яркости).
        var SHADE = 'linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.4) 40%,rgba(0,0,0,0) 66%),linear-gradient(0deg,rgba(0,0,0,.92) 0%,rgba(0,0,0,.5) 34%,rgba(0,0,0,0) 58%)';
        c.push('.my-trailer{position:absolute;left:0;width:100%;z-index:-1;pointer-events:none;overflow:hidden;opacity:0;transition:opacity 240ms linear}');
        // Страница фильма: слой на 6em выше страницы и до низа экрана (при 100vh внизу оставалась серая полоса).
        c.push('.my-full > .my-trailer{top:-6em;height:calc(100vh + 6em)}');
        c.push('.my-trailer.my-trailer--on{opacity:1;transition:opacity 600ms cubic-bezier(.4,0,.2,1)}');
        c.push('.my-trailer__box{position:absolute;left:0;top:0;width:640px;height:360px;transform-origin:0 0}');
        c.push('.my-trailer__box iframe{width:640px;height:360px;border:0;display:block;background:#000}');
        c.push('.my-trailer__shade{position:absolute;left:0;top:0;right:0;bottom:0;background:' + SHADE + '}');

        // ПРАВКА 7: рейтинги («таблетки» источников).
        c.push('.my-rates{display:inline-flex;align-items:center;flex-wrap:wrap}');
        c.push('.my-rate{display:inline-flex;align-items:center;margin-right:0.9em;white-space:nowrap;font-weight:600}');
        c.push('.my-rate__src{display:inline-block;font-size:0.72em;line-height:1;padding:0.25em 0.38em;border-radius:0.25em;margin-right:0.38em;font-weight:700;letter-spacing:.02em}');
        c.push('.my-rate--imdb .my-rate__src{background:#f5c518;color:#000}');
        c.push('.my-rate--tmdb .my-rate__src{background:#01b4e4;color:#fff}');
        c.push('.my-rate--kp .my-rate__src{background:#ff6a00;color:#fff}');
        c.push('.my-rate--cub .my-rate__src{background:rgba(255,255,255,.22);color:#fff}');
        c.push('.my-rate--tomatoes .my-rate__src,.my-rate--popcorn .my-rate__src{background:none;font-size:1em;padding:0;margin-right:0.25em}');

        // ПРАВКА 6: страница фильма — фон на весь экран, логотип, строка «год · мин · жанры · статус», описание,
        // продюсеры, рейтинги и реакции, кнопки; ниже «Похожие» широкими карточками и «Актёры» прямоугольными фото.
        var H = 'body.my-hero .my-full ';
        c.push(H + '.full-start-new__left{display:none}');
        c.push(H + '.full-start-new{padding-bottom:1.5em}');
        c.push(H + '.full-start-new__body{min-height:calc(74vh - 6em);align-items:flex-end}');
        // Фон, затемнение и слой трейлера — высотой 100vh + 6em (при 100vh внизу была серая полоса поверх «Похожих»).
        c.push(H + '.full-start__background{left:0!important;width:100%!important;top:-6em!important;height:calc(100vh + 6em)!important;object-fit:cover;-webkit-mask-image:none!important;mask-image:none!important}');
        c.push(H + '.my-hero-shade{position:absolute;left:0;top:-6em;width:100%;height:calc(100vh + 6em);z-index:-1;pointer-events:none;' +
            'background:linear-gradient(90deg,rgba(0,0,0,.8) 0%,rgba(0,0,0,.5) 38%,rgba(0,0,0,0) 70%),linear-gradient(0deg,rgba(0,0,0,.9) 0%,rgba(0,0,0,.35) 32%,rgba(0,0,0,0) 55%)}');
        c.push(H + '.full-start-new__head,' + H + '.full--tagline,' + H + '.full-start-new__rate-line,' + H + '.full-start-new__details{display:none!important}');
        c.push(H + '.full-start-new__title.my-hero-title--logo{font-size:1em;line-height:1;margin-bottom:0.9em;display:block;overflow:visible;-webkit-line-clamp:none}');
        c.push(H + '.my-hero-logo{display:block;max-height:5.2em;max-width:26em;object-fit:contain;object-position:left bottom}');
        c.push(H + '.my-hero-meta{display:flex;flex-wrap:wrap;align-items:center;font-size:1.2em;color:rgba(255,255,255,.75);margin-bottom:0.45em}');
        c.push(H + '.my-hero-meta > span{margin-right:0.5em}');
        c.push(H + '.my-hero-meta .my-hero-dot{opacity:.6}');
        c.push(H + '.my-hero-descr{font-size:1.32em;line-height:1.38;max-width:42em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin-bottom:0.55em}');
        c.push(H + '.my-hero-crew{font-size:1.08em;color:rgba(255,255,255,.55);margin-bottom:0.8em}');
        c.push(H + '.my-hero-crew span{color:rgba(255,255,255,.88)}');
        c.push(H + '.my-hero-line{display:flex;align-items:center;flex-wrap:wrap;font-size:1.15em;margin-bottom:1em}');
        c.push(H + '.my-hero-line .full-start-new__reactions{margin:0;min-height:0;font-size:0.85em}');
        c.push(H + '.full-start__button{background:rgba(255,255,255,.14);border:0.06em solid rgba(255,255,255,.22);border-radius:0.5em}');
        c.push(H + '.full-start__button.focus{background:#fff;color:#000;border-color:#fff}');
        c.push(H + '.full-start-new__buttons .full-start__button.button--play span{display:inline!important}');
        // Кнопки — как на образце: «Смотреть» с подписью, остальные квадратные значки. «Избранное» и «Подписаться»
        // при выборе не расширяются (Lampa показывает подпись у выбранной кнопки); меню «•••» убрано (просьба 14.11.2026).
        c.push(H + '.full-start-new__buttons .full-start__button.button--book span,' + H + '.full-start-new__buttons .full-start__button.button--subscribe span{display:none!important}');
        c.push(H + '.full-start-new__buttons .full-start__button.button--options{display:none!important}');
        c.push(H + '.my-btn svg{width:1.5em;height:1.5em}');
        // Lampa прячет span у невыбранных кнопок — свои значки показываем всегда.
        c.push(H + '.full-start-new__buttons .full-start__button .my-ico{display:flex!important;align-items:center}');
        c.push(H + '.my-btn .my-ico + span{margin-left:0.6em}');
        c.push(H + '.full-person{display:block;width:14em;padding:0;margin-right:1.2em;background:none!important;color:inherit!important;border-radius:0.9em}');
        c.push(H + '.full-person__photo{width:14em;height:19em;margin:0 0 0.75em 0;border-radius:0.9em;background-color:rgba(255,255,255,.08);transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(H + '.full-person__photo > img{width:100%;height:100%;object-fit:cover}');
        c.push(H + '.full-person.focus .full-person__photo{transform:scale(1.06);box-sizing:border-box;border:0.12em solid rgba(255,255,255,.85);transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');
        c.push(H + '.full-person__name{font-size:1.25em}');
        c.push(H + '.full-person__role{font-size:1em;margin-top:0.25em;color:rgba(255,255,255,.55)}');
        // Ряд «Эпизоды» сериала (по образцу): четыре кадра на экран между отступами ряда, крупный номер серии на кадре,
        // под кадром «N. Название» и длительность; в конце — плитка «Все сезоны» (страница сезонов Lampa).
        var E = H + '.my-eps ';
        // Четыре кадра и три промежутка по 0.6em — ровно ширина окна ряда (100vw − 3em): пятый не выглядывает.
        var EPW = 'calc((100vw - 4.8em) / 4)';
        c.push(E + '.mapping--line > * + *{margin-left:0.6em}');
        c.push(E + '.full-episode--small{width:' + EPW + ';margin-right:0}');
        c.push(E + '.full-episode.focus::after{display:none}');
        c.push(E + '.full-episode__body{display:none!important}');
        c.push(E + '.full-episode__img{padding-bottom:56.25%;border-radius:0.55em;background-color:rgba(255,255,255,.08);' +
            'transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(E + '.full-episode__img img{border-radius:0.55em;object-fit:cover}');
        c.push(E + '.full-episode.focus .full-episode__img{-webkit-transform:scale(1.06);transform:scale(1.06);transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');
        c.push(E + '.full-episode:first-child .full-episode__img{-webkit-transform-origin:0 50%;transform-origin:0 50%}');
        c.push(E + '.full-episode.focus .full-episode__img::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;z-index:3;' +
            'box-sizing:border-box;border:0.16em solid #fff;border-radius:0.55em;pointer-events:none}');
        c.push(E + '.full-episode--next .full-episode__img{background-color:transparent}');
        c.push(E + '.full-episode--next .full-episode__img::after{border-radius:0.55em}');
        c.push(E + '.full-episode__viewed{z-index:2}');
        c.push('.my-ep-shade{position:absolute;left:0;right:0;bottom:0;height:55%;z-index:1;pointer-events:none;border-radius:0 0 0.55em 0.55em;' +
            'background:linear-gradient(0deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,0) 100%)}');
        c.push('.my-ep-num{position:absolute;left:0.32em;bottom:0.08em;z-index:2;font-size:2.6em;font-weight:700;line-height:1;color:#fff;pointer-events:none}');
        c.push('.my-ep-cap{padding:0.5em 0.2em 0}');
        c.push('.my-ep-cap__title{font-size:1.1em;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
        c.push('.my-ep-cap__sub{font-size:0.95em;line-height:1.3;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
        c.push('.my-ep-season{margin-left:0.6em;font-size:0.8em;color:rgba(255,255,255,.5)}');
        // Плитка «Все сезоны» — размером с кадр серии (без подписи под ней — выше подписей серий).
        c.push(E + '.mapping--line > .card-more{width:' + EPW + '!important}');
        c.push('.my-details{font-size:1.1em;line-height:1.5}');
        c.push('.my-details__row{margin-bottom:0.6em}');
        c.push('.my-details__row b{color:rgba(255,255,255,.55);font-weight:400;margin-right:0.5em}');

        // ПРАВКА 13: шапка спрятана прозрачностью на главном, «Фильмах», «Сериалах», жанрах из «Каталога» и на странице
        // фильма (место и навигация остаются); «вверх» с верхнего ряда — плавно появляется, «вниз» — исчезает.
        c.push('body.my-hidehead.my-head-page .head{opacity:0;transition:opacity 300ms cubic-bezier(.4,0,.2,1)}');
        c.push('body.my-hidehead.my-head-page.my-head-on .head{opacity:1}');

        // ПРАВКА 12: страница «Еще» — широкие плитки по три в ряд той же ширины, что на главном, с подписью.
        // У Lampa сетка: отступ контейнера 1em, поля карточки 0.5em, ширина 1/6 (cols--6).
        var K = '.my-cat ';
        c.push(K + '.mapping--grid{padding:0 calc(1.5em - 0.19em)!important}');
        // Нижнее поле 2em: ровно два ряда с подписями на экран, третий начинается за нижним краем.
        c.push(K + '.mapping--grid > .card{width:33.3333%!important;padding:0 0.19em 2em 0.19em!important;margin:0!important;box-sizing:border-box}');
        // Без затемнения верха и низа страницы (mask Lampa), отступ сверху 1em — меньше нижнего поля карточки:
        // подпись предыдущего ряда из-под шапки не выглядывает, увеличенной карточке сверху места хватает.
        c.push(K + '.scroll--mask{-webkit-mask-image:none!important;mask-image:none!important}');
        c.push(K + '.scroll--mask .scroll__content{padding:1em 0 2em 0!important}');
        c.push(K + '.my-cap{padding-top:0.4em;min-height:3.82em}');   // всегда три строки: ряды одной высоты
        c.push(K + '.card .card__promo,' + K + '.card .card__vote,' + K + '.card .card-watched{display:none!important}');
        // Выбранная растёт внутрь экрана: левая колонка — вправо, правая — влево, средняя — от центра. Колонки
        // считаем только среди карточек («of .card»): Lampa вставляет в сетку служебные блоки при подгрузке.
        c.push(K + '.card .card__view{-webkit-transform-origin:50% 50%!important;transform-origin:50% 50%!important}');
        c.push(K + '.mapping--grid > .card:nth-child(3n+1 of .card) .card__view{-webkit-transform-origin:0 50%!important;transform-origin:0 50%!important}');
        c.push(K + '.mapping--grid > .card:nth-child(3n of .card) .card__view{-webkit-transform-origin:100% 50%!important;transform-origin:100% 50%!important}');
        c.push(LG + ' ' + K + '.mapping--grid > .card:has(+ .card:nth-child(3n of .card).focus) .card__view .card__icons::before{' +
            '-webkit-transform:translateX(-2em);transform:translateX(-2em);transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');

        // ПРАВКА 12: «Избранное» — как «Еще»: ряды широких карточек с подписью, по три на экран (размеры рядов — общие,
        // см. ROWS). Все промежутки в ряду одинаковые, папки «Фильмы / Сериалы» — плитки размером с карточку.
        var B = '.my-book ';
        c.push(B + '.mapping--line > * + *{margin-left:0.38em}');
        c.push(B + '.mapping--line > .bookmarks-folder{width:calc((100vw - 3.76em) / 3);margin-right:0}');
        c.push(B + '.bookmarks-folder .card__view{height:0;padding-bottom:56.25%!important;border-radius:0.55em}');
        c.push(B + '.bookmarks-folder__layer{box-sizing:border-box;border-radius:0.55em;border:0.07em solid rgba(255,255,255,.22);' +
            'background:linear-gradient(160deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,.07) 45%,rgba(255,255,255,.1) 100%)}');
        c.push(B + '.bookmarks-folder__body{display:none}');
        c.push(B + '.bookmarks-folder__head{padding:1.1em 1.2em}');
        c.push(B + '.bookmarks-folder__title{font-size:1.7em;font-weight:500}');
        c.push(B + '.bookmarks-folder__num{font-size:1.3em;font-weight:400;opacity:.7;margin-top:0.2em}');
        c.push(B + '.mapping--line > .card:first-child .card__view{-webkit-transform-origin:0 50%;transform-origin:0 50%}');
        c.push(B + '.my-cap{padding-top:0.4em;min-height:3.82em}');   // место под жанры сразу — ряд не «прыгает»
        c.push(B + '.register{background:rgba(255,255,255,.1);border-radius:0.55em}');
        // Рамка выбранной плитки-счётчика — по краю плитки (у Lampa она на 0.5em снаружи и обрезается краем ряда).
        c.push(B + '.register.focus::after{top:0;left:0;right:0;bottom:0;box-sizing:border-box;border-width:0.16em;border-radius:0.55em;z-index:1;pointer-events:none}');

        // ПРАВКА 12: «Избранное» — три плитки «Нравится / Позже / Закладки» размером с карточку, ряд по центру экрана
        // (по вертикали — между шапкой и низом экрана). Плитки непрозрачные: выбранная растёт (×1.08) и закрывает край
        // соседней целиком, без просвечивания (просьба 14.11.2026).
        var BT = '.my-book--tiles ';
        var TILE_W = 'calc((100vw - 3.76em) / 3)';
        c.push(BT + '.items-line__head{display:none}');
        c.push(BT + '.scroll:not(.scroll--horizontal) > .scroll__content > .scroll__body{min-height:calc(100vh - 4em - 3.6em);display:flex;flex-direction:column;justify-content:center}');
        c.push(BT + '.mapping--line > .register{width:' + TILE_W + ';height:calc(' + TILE_W + ' * 0.5625);min-width:0;margin-right:0;padding:0 1em;' +
            'box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-radius:0.55em;' +
            'background-color:#1c1c1f;background-image:linear-gradient(160deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 45%,rgba(255,255,255,.08) 100%);' +
            'border:0.07em solid rgba(255,255,255,.16);transition:transform 180ms cubic-bezier(.333,1,.667,1)}');
        c.push(BT + '.mapping--line > .register:first-child{-webkit-transform-origin:0 50%;transform-origin:0 50%}');
        c.push(BT + '.mapping--line > .register:last-child{-webkit-transform-origin:100% 50%;transform-origin:100% 50%}');
        c.push(BT + '.register__name{font-size:2.2em;font-weight:500;line-height:1.2;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
        c.push(BT + '.register__counter{font-size:1.5em;font-weight:400;line-height:1.3;margin-top:0.25em;color:rgba(255,255,255,.65)}');
        c.push(BT + '.register.focus{position:relative;z-index:3;background-color:#2e2e33;-webkit-transform:scale(1.08);transform:scale(1.08);' +
            'transition:transform 260ms cubic-bezier(.333,1.533,.667,1)}');
        c.push(BT + '.register.focus .register__counter{color:rgba(255,255,255,.85)}');

        // ПРАВКА 17: значки закладок («Избранное», «Нравится», «Позже») — в правом нижнем углу кадра, а не сверху по
        // центру. Блок значков Lampa делаем «прозрачным» для раскладки (static): значки и метка «Фильм / Сериал» (его
        // ::before) отсчитываются от самого кадра. Растянутый на весь кадр блок (первый вариант) стоил ~4 мс на кадр
        // листания (замер A/B 14.11.2026: 31 мс против 26–27 мс) — так не делаем.
        c.push(scoped('body', '.card .card__view .card__icons') + '{position:static}');
        c.push(scoped('body', '.card .card__view .card__icons-inner') + '{position:absolute;right:0.9em;bottom:0.9em;z-index:1}');
        c.push(scoped(L, '.card:not(.card--collection) .card__view .card__icons::before') + '{top:0.55em;z-index:1}');

        // ПРАВКА 16: тёмная тема по образцу — чёрный фон вместо размытого цветного кадра Lampa (он просвечивал через
        // меню), тёмные меню, настройки, окна выбора. Только цвета, раскладка Lampa не меняется.
        var D = 'body.my-dark';
        c.push(D + '{background:#000!important}');
        c.push(D + ' .background{display:none!important}');
        c.push(D + ' .wrap__left{background:#0e0e0e}');
        c.push(D + ' .settings__content,' + D + ' .selectbox__content,' + D + ' .modal__content{background-color:#141414!important}');
        c.push(D + ' .register{background-color:rgba(255,255,255,.08)}');

        // ПРАВКА 10: шрифт (сам @font-face добавляется после загрузки шрифта из хранилища ТВ).
        c.push('body.my-font,body.my-font *{font-family:"MySFPro",-apple-system,"Segoe UI",Roboto,sans-serif!important}');
    }

    function injectCss() {
        var st = document.getElementById('my-interface-style');
        if (st) return;
        st = document.createElement('style');
        st.id = 'my-interface-style';
        st.textContent = buildCss();
        document.head.appendChild(st);
    }

    // ---------------------------------------------------------------------------------------
    // Классы на body: выключатели правок (действуют сразу)
    // ---------------------------------------------------------------------------------------

    // Классы-выключатели на <body>. Имена не совпадают с классами элементов (.my-status, .my-banner):
    // иначе стили таблетки статуса и баннера ложатся на сам <body> и сдвигают весь экран.
    var BODY_FLAGS = [
        ['my_motion', true, 'my-motion'],          // ПРАВКА 3
        ['my_status', true, 'my-on-status'],       // ПРАВКА 9
        ['my_card_caps', true, 'my-caps'],         // ПРАВКА 11
        ['my_banner_bright', true, 'my-on-bright'],// ПРАВКА 14
        ['my_glass', true, 'my-glass'],            // ПРАВКА 2
        ['my_hide_play', true, 'my-hide-play'],    // ПРАВКА 5
        ['my_type_label', true, 'my-type-label'],  // ПРАВКА 8
        ['my_hero', true, 'my-hero'],              // ПРАВКА 6
        ['my_hide_head', true, 'my-hidehead'],     // ПРАВКА 13
        ['my_dark', true, 'my-dark']               // ПРАВКА 16
    ];

    function applyBodyClasses() {
        if (!document.body) return;
        for (var i = 0; i < BODY_FLAGS.length; i++) {
            document.body.classList.toggle(BODY_FLAGS[i][2], opt(BODY_FLAGS[i][0], BODY_FLAGS[i][1]) === true);
        }
        // ПРАВКА 10: шрифт — когда он уже загружен из хранилища ТВ и включён.
        document.body.classList.toggle('my-font', !!(Font && Font.ready) && opt('my_font', false) === true);
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКИ 14 + 15: фон баннера — два кадра, плавная смена; кадр показываем, когда он загружен и декодирован
    // ---------------------------------------------------------------------------------------

    function bgSize() {
        var v = String(opt('my_bg_size', 'w1280'));
        return (v === 'w780' || v === 'original') ? v : 'w1280';
    }

    function backdropUrl(data, size) {
        if (!data) return '';
        var p = data.backdrop_path || data.poster_path || '';
        if (!p) return '';
        try { return Lampa.Api.img(p, size || bgSize()); } catch (e) { return tmdbImage(p, size || bgSize()); }
    }

    function Background(root) {
        this.root = root;
        this.imgs = [make('img', 'my-bg__img'), make('img', 'my-bg__img')];
        root.appendChild(this.imgs[0]);
        root.appendChild(this.imgs[1]);
        this.cur = -1;
        this.url = '';
        this.timer = null;
        this.token = 0;
    }
    Background.prototype.set = function (url) {
        var self = this;
        if (url === this.url) return;
        this.url = url;
        clearTimeout(this.timer);
        var token = ++this.token;
        this.timer = setTimeout(function () {
            if (!url) {
                for (var i = 0; i < 2; i++) self.imgs[i].classList.remove('my-bg__img--on');
                return;
            }
            var next = self.imgs[self.cur === 0 ? 1 : 0];
            var show = function () {
                if (token !== self.token) return;
                if (self.cur >= 0) self.imgs[self.cur].classList.remove('my-bg__img--on');
                next.classList.add('my-bg__img--on');
                self.cur = self.imgs.indexOf(next);
            };
            next.onload = function () {
                next.onload = null;
                if (token !== self.token) return;
                // Декодируем заранее (не в кадре анимации): показываем, когда картинка готова.
                if (typeof next.decode === 'function') next.decode().then(show, show);
                else show();
            };
            next.onerror = function () { next.onerror = null; };
            next.src = url;
        }, 60);
    };
    Background.prototype.destroy = function () {
        clearTimeout(this.timer);
        this.token++;
    };

    // ---------------------------------------------------------------------------------------
    // ПРАВКИ 3, 9, 15: баннер главного экрана
    // ---------------------------------------------------------------------------------------

    function directionOf(prev, cur) {
        if (!prev || !cur || prev === cur || !inDoc(prev)) return '';
        var following = (prev.compareDocumentPosition(cur) & 4) !== 0;
        if (prev.parentNode === cur.parentNode) return following ? 'r' : 'l';
        return following ? 'd' : 'u';
    }

    function Home(main) {
        this.main = main;
        this.container = main.render(true);
        this.bgRoot = make('div', 'my-bg');
        this.bg = new Background(this.bgRoot);
        this.banner = make('div', 'my-banner');
        this.body = make('div', 'my-banner__body');
        this.banner.appendChild(this.body);
        this.data = null;
        this.card = null;
        this.seq = 0;
        this.flip = false;
        this.ghost = null;
        this.ghostTimer = null;
        this.infoTimer = null;
        this.nearTimer = null;
        this.attach();
    }

    Home.prototype.attach = function () {
        var c = this.container;
        c.classList.add('my-home');
        c.__myHome = this;
        c.insertBefore(this.bgRoot, c.firstChild || null);
        c.insertBefore(this.banner, this.bgRoot.nextSibling);
        try { this.main.scroll.minus(this.banner); } catch (e) { warnOnce(15, 'scroll.minus недоступен — ряды могут залезть под баннер'); }
    };

    Home.prototype.destroy = function () {
        clearTimeout(this.ghostTimer);
        clearTimeout(this.infoTimer);
        clearTimeout(this.nearTimer);
        this.seq++;          // ответы TMDB, пришедшие после ухода, баннер уже не перерисовывают
        netTrim(0);          // подготовка соседей больше не нужна
        this.bg.destroy();
        if (this.container) this.container.__myHome = null;
        this.data = null;
        this.card = null;
    };

    // Старое содержимое — копией поверх, уходит в сторону нажатия и гаснет (только opacity/transform).
    Home.prototype.leave = function (dir) {
        if (this.ghost && this.ghost.parentNode) this.ghost.parentNode.removeChild(this.ghost);
        this.ghost = null;
        clearTimeout(this.ghostTimer);
        // Быстрое листание (нажатия чаще 0,3 с): уход старого текста всё равно не успеть увидеть — не копируем
        // его и не анимируем, меньше работы на каждое нажатие.
        var now = Date.now(), fast = now - (this.lastLeave || 0) < 300;
        this.lastLeave = now;
        if (fast) return;
        if (!dir || !this.body.firstChild || !document.body.classList.contains('my-motion') || document.body.classList.contains('no--animation')) return;
        // Копия сохраняет классы (а значит, размеры и цвета) текущего текста. Убираем только проявление
        // логотипа, иначе оно запустится заново и старый логотип мигнёт.
        var g = this.body.cloneNode(true);
        g.className = 'my-banner__body my-banner__ghost my-out-' + dir;
        var fades = g.querySelectorAll('.my-fade-in');
        for (var i = 0; i < fades.length; i++) fades[i].classList.remove('my-fade-in');
        this.banner.appendChild(g);
        this.ghost = g;
        var self = this;
        this.ghostTimer = setTimeout(function () {
            if (g.parentNode) g.parentNode.removeChild(g);
            if (self.ghost === g) self.ghost = null;
        }, 320);
    };

    Home.prototype.animateIn = function (dir) {
        if (!dir || !document.body.classList.contains('my-motion')) return;
        this.flip = !this.flip;
        this.body.className = 'my-banner__body my-in-' + dir + '-' + (this.flip ? 'a' : 'b');
    };

    Home.prototype.detailsNode = function (data, rec) {
        var tv = isTv(data);
        var parts = [];
        var genres = rec ? rec.g : [];
        if (!genres || !genres.length) {
            try {
                genres = (Lampa.Api.sources.tmdb.getGenresNameFromIds(mediaType(data), data.genre_ids || []) || []).slice(0, 2);
            } catch (e) { genres = []; }
            for (var i = 0; i < genres.length; i++) genres[i] = capFirst(genres[i]);
        }
        if (genres.length) parts.push(document.createTextNode(genres.join(' | ')));
        var yc = [];
        var y = (rec && rec.y) || yearOf(data);
        if (y) yc.push(y);
        if (rec && rec.c && rec.c.length) yc.push(rec.c.join(', '));
        if (yc.length) parts.push(document.createTextNode(yc.join(', ')));
        if (rec && tv && rec.s) parts.push(make('span', 'my-banner__pg', 'Сезонов ' + rec.s));
        if (rec && rec.st) {
            var look = statusLook(rec.st, tv);
            if (look) parts.push(make('span', 'my-status my-status--' + look[0], look[1]));
        }
        var box = make('div', 'my-banner__details');
        for (var p = 0; p < parts.length; p++) {
            if (p > 0) box.appendChild(make('span', 'my-banner__split', '●'));
            box.appendChild(parts[p]);
        }
        return box;
    };

    function imgReady(img) { return !!(img.complete && img.naturalWidth); }

    // Сколько ждать логотип, прежде чем показать название текстом (место под логотип в это время пустое).
    // Первая карточка после запуска ждёт дольше: в это время Lampa грузит ряды и сеть занята.
    var LOGO_WAIT = 700;
    var LOGO_WAIT_FIRST = 1500;

    // Название или логотип — сразу в окончательном виде, без промежуточного текста:
    //  - логотип w500 уже загружен — сразу он;
    //  - загружен w300 (тот, что на карточке) — сразу он, а w500 подставляем без анимации, когда догрузится;
    //  - ничего не загружено или данных ещё нет — место под логотип пустое до LOGO_WAIT мс, потом название
    //    текстом; если логотип придёт позже — плавная замена.
    // keepText — название уже показано текстом: не прячем его, логотип сменит текст плавно, когда загрузится.
    Home.prototype.titleNode = function (data, rec, keepText) {
        var box = make('div', 'my-banner__title');
        var name = data.title || data.name || '';
        var small;                                   // адрес w300 | '' — логотипа нет | null — пока неизвестно
        if (rec) small = rec.lg ? tmdbImage(rec.lg, 'w300') : '';
        else {
            var k = knownLogo(data);
            small = k === undefined ? ((sourceOk(data) && !data.adult) ? null : '') : k;
        }
        if (small === '') { box.textContent = name; return box; }
        var self = this, seq = this.seq;
        var wait = this.shown > 1 ? LOGO_WAIT : LOGO_WAIT_FIRST;
        var reveal = function () {                   // ожидание вышло — название текстом
            if (seq !== self.seq || !inDoc(box) || !hasCls(box, 'my-wait')) return;
            box.classList.remove('my-wait');
            if (!box.querySelector('img') || !imgReady(box.querySelector('img'))) box.textContent = name;
        };
        if (small === null) {                        // ждём ответ TMDB: show() подставит новый заголовок
            box.classList.add('my-wait');
            box.textContent = name;
            setTimeout(reveal, wait + 300);
            return box;
        }
        var big = small.replace('/w300/', '/w500/');
        var img = make('img', 'my-banner__logo');
        img.alt = '';
        img.src = big;
        if (imgReady(img)) { box.appendChild(img); return box; }
        var probe = new Image();
        probe.src = small;
        if (imgReady(probe)) {
            var shown = make('img', 'my-banner__logo');
            shown.alt = '';
            shown.src = small;
            box.appendChild(shown);
            img.onload = function () { if (inDoc(shown)) shown.src = big; };
            return box;
        }
        var timer = null;
        if (keepText) box.textContent = name;
        else {
            box.classList.add('my-wait');
            box.appendChild(img);
            timer = setTimeout(reveal, wait);
        }
        img.onerror = function () {
            clearTimeout(timer);
            if (seq !== self.seq || !inDoc(box)) return;
            box.classList.remove('my-wait');
            box.textContent = name;
        };
        img.onload = function () {
            if (seq !== self.seq || !inDoc(box)) return;
            if (hasCls(box, 'my-wait')) { clearTimeout(timer); box.classList.remove('my-wait'); return; }
            if (img.parentNode === box) return;
            box.textContent = '';                    // логотип пришёл после текста — плавная замена
            img.className = 'my-banner__logo my-fade-in';
            box.appendChild(img);
        };
        return box;
    };

    Home.prototype.render = function (data, rec) {
        var b = this.body;
        while (b.firstChild) b.removeChild(b.firstChild);
        b.appendChild(this.titleNode(data, rec));
        b.appendChild(this.detailsNode(data, rec));
        var descr = data.overview || (rec && rec.o) || '';
        if (!descr) { try { descr = Lampa.Lang.translate('full_notext'); } catch (e) { descr = 'Без описания.'; } }
        b.appendChild(make('div', 'my-banner__descr', descr));
    };

    Home.prototype.show = function (card) {
        var data = card.card_data;
        if (!data || data === this.data) return;
        var dir = directionOf(this.card, card);
        this.card = card;
        this.data = data;
        this.seq++;
        this.shown = (this.shown || 0) + 1;
        var seq = this.seq, self = this;
        var rec = cachedInfo(data);
        this.leave(dir);
        this.render(data, rec);
        this.animateIn(dir);
        this.bg.set(backdropUrl(data));
        clearTimeout(this.infoTimer);
        clearTimeout(this.nearTimer);
        if (!rec && sourceOk(data)) {
            // Небольшая пауза: при быстром листании не спрашиваем TMDB о каждой пролистанной карточке.
            this.infoTimer = setTimeout(function () {
                getInfo(data, function (r) {
                    if (!r || seq !== self.seq) return;
                    var oldD = self.body.querySelector('.my-banner__details');
                    if (oldD) self.body.replaceChild(self.detailsNode(data, r), oldD);
                    var oldT = self.body.querySelector('.my-banner__title');
                    if (oldT && !oldT.querySelector('img') && (r.lg || hasCls(oldT, 'my-wait'))) self.body.replaceChild(self.titleNode(data, r, !hasCls(oldT, 'my-wait')), oldT);
                    var de = self.body.querySelector('.my-banner__descr');
                    if (de && !data.overview && r.o) de.textContent = r.o;
                }, true);
            }, 120);
        }
        // Соседей готовим заранее, когда пользователь остановился: данные, логотип, кадр фона.
        this.nearTimer = setTimeout(function () { if (seq === self.seq) self.prefetchNear(card); }, 450);
    };

    // Подготовить карточку: данные TMDB и логотип для баннера (w500), по желанию кадр фона. Логотип w300 для
    // самой карточки грузится, когда карточка показана: лишние загрузки замедляют картинки Lampa.
    function prefetchCard(d, withBg) {
        if (!d) return;
        getInfo(d, function (r) {
            if (r && r.lg) { var a = new Image(); a.src = tmdbImage(r.lg, 'w500'); }
        });
        if (!withBg) return;
        var url = backdropUrl(d);
        if (url) { var bi = new Image(); bi.src = url; }
    }

    function cardsOf(row) {
        var out = [];
        for (var n = row ? row.firstElementChild : null; n; n = n.nextElementSibling) if (hasCls(n, 'card')) out.push(n);
        return out;
    }

    // Соседний ряд (dir = 1 — ниже, -1 — выше) того ряда, где стоит карточка.
    function nextLine(card, dir) {
        var line = closestCls(card, 'items-line');
        for (var n = line ? (dir > 0 ? line.nextElementSibling : line.previousElementSibling) : null; n; n = dir > 0 ? n.nextElementSibling : n.previousElementSibling) {
            if (hasCls(n, 'items-line')) return n;
        }
        return null;
    }

    Home.prototype.prefetchNear = function (card) {
        // Свой ряд: ±2 карточки (данные, логотипы, кадр фона).
        var cards = cardsOf(card.parentNode);
        var at = cards.indexOf(card);
        var order = [1, -1, 2, -2];
        for (var i = 0; i < order.length; i++) {
            var el = cards[at + order[i]];
            if (el) prefetchCard(el.card_data, true);
        }
        // Ряды выше и ниже: карточки, что видны по горизонтали (не больше трёх), — только данные и логотип,
        // чтобы при «вверх»/«вниз» название сразу было логотипом. Кадры фона для них не грузим: это заметно
        // замедляло картинки самой Lampa. Раскладку читаем раз в остановку, через 450 мс после нажатия.
        var vw = window.innerWidth;
        for (var dir = -1; dir <= 1; dir += 2) {
            var line = nextLine(card, dir);
            if (!line) continue;
            var first = line.querySelector('.card');
            var list = first ? cardsOf(first.parentNode) : [];
            for (var k = 0, seen = 0; k < list.length && seen < 3; k++) {
                var r = list[k].getBoundingClientRect();
                if (r.width === 0 || r.right <= 0 || r.left >= vw) continue;
                seen++;
                prefetchCard(list[k].card_data, false);
            }
        }
        decoratePending();
    };

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 11: логотип или название на кадре карточки. Запрос — только для карточек, которые реально на экране.
    // ---------------------------------------------------------------------------------------

    var pendingCards = [];

    function setCardLogo(cardEl, url) {
        var view = cardEl.querySelector('.card__view');
        if (!view || view.querySelector('.my-card-logo') || view.querySelector('.my-card-name')) return;
        var data = cardEl.card_data || {};
        var showName = function () {
            if (view.querySelector('.my-card-name')) return;
            view.appendChild(make('div', 'my-card-shade'));
            view.appendChild(make('div', 'my-card-name', data.title || data.name || ''));
        };
        if (!url) { showName(); return; }
        var img = make('img', 'my-card-logo');
        img.alt = '';
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); showName(); };
        img.src = url;
        view.appendChild(img);
    }

    // Подпись «название / жанры / год» (правки 6 и 12).
    function addCaption(cardEl, data) {
        var cap = make('div', 'my-cap');
        cap.appendChild(make('div', 'my-cap__title', data.title || data.name || ''));
        var genres = [];
        try { genres = Lampa.Api.sources.tmdb.getGenresNameFromIds(mediaType(data), data.genre_ids || []) || []; } catch (e) { genres = []; }
        // Закладки и история хранят карточку со страницы фильма: там жанры списком {id, name}, а не genre_ids.
        if (!genres.length && data.genres && data.genres.length) {
            for (var g = 0; g < data.genres.length; g++) if (data.genres[g] && data.genres[g].name) genres.push(capFirst(data.genres[g].name));
        }
        if (genres.length) cap.appendChild(make('div', 'my-cap__genres', genres.slice(0, 2).join(' • ')));
        else cardEl.__myNeedG = true;   // жанры придут с данными фильма (тот же запрос, что за логотипом)
        var year = yearOf(data);
        if (year) cap.appendChild(make('div', 'my-cap__year', year));
        cardEl.appendChild(cap);
    }

    // Закладки и история хранят урезанную карточку — без жанров: дописываем их в подпись из данных фильма.
    function fillCapGenres(cardEl, rec) {
        if (!cardEl.__myNeedG || !rec || !rec.g || !rec.g.length) return;
        var cap = cardEl.querySelector('.my-cap');
        if (!cap || !cap.firstChild) return;
        cardEl.__myNeedG = false;
        cap.insertBefore(make('div', 'my-cap__genres', rec.g.join(' • ')), cap.firstChild.nextSibling);
    }

    // withCap — карточка «Похожих» (страница фильма ещё собирается, класса my-full у предка может не быть).
    function decorateCard(cardEl, withCap) {
        if (!cardEl || !hasCls(cardEl, 'card')) return;
        var data = cardEl.card_data;
        if (!data) return;
        if (!cardEl.__myCap && (withCap || closestCls(cardEl, 'my-full') || closestCls(cardEl, 'my-cat') || closestCls(cardEl, 'my-book'))) {
            cardEl.__myCap = true;
            addCaption(cardEl, data);
        }
        if (cardEl.__myNeedG) fillCapGenres(cardEl, cachedInfo(data));
        if (cardEl.__myDec || opt('my_card_logos', true) !== true || !sourceOk(data)) return;
        cardEl.__myDec = true;
        var k = knownLogo(data);
        if (k !== undefined) {
            setCardLogo(cardEl, k);
            if (!cardEl.__myNeedG) return;   // логотип известен, но для подписи нужны жанры — тот же запрос
        }
        pendingCards.push(cardEl);
        if (pendingCards.length > 200) pendingCards.splice(0, pendingCards.length - 200);
    }

    // Карточки без логотипа в кэше: запрашиваем только те, что на экране (с запасом в одну карточку).
    function decoratePending() {
        if (!pendingCards.length) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        var list = pendingCards, keep = [], near = [];
        // Сначала только читаем раскладку, потом вставляем — без пересчёта раскладки на каждую карточку.
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (!inDoc(el)) continue;
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > -r.width && r.left < vw + r.width && r.bottom > 0 && r.top < vh) near.push(el);
            else keep.push(el);
        }
        pendingCards = keep;
        for (var j = 0; j < near.length; j++) requestCardLogo(near[j]);
    }

    function requestCardLogo(el) {
        getInfo(el.card_data, function (rec) {
            if (!inDoc(el) || !el.__myDec) return;          // карточку убрали или логотипы выключили
            fillCapGenres(el, rec);
            if (rec) setCardLogo(el, rec.lg ? tmdbImage(rec.lg, 'w300') : '');
            else if (el.card_data && el.card_data.adult) setCardLogo(el, '');
            else if (pendingCards.length < 200) pendingCards.push(el);   // нет ответа — попробуем при следующей остановке
        });
    }

    // На странице фильма и «Еще» логотипы для новых карточек — через 450 мс после последнего нажатия.
    var decorateTimer = null;
    function decorateSoon() {
        if (!pendingCards.length) return;
        clearTimeout(decorateTimer);
        decorateTimer = setTimeout(decoratePending, 450);
    }

    // Выключатель «Логотипы на карточках» — сразу, без перезапуска.
    function refreshCardLogos() {
        var on = opt('my_card_logos', true) === true;
        var cards = document.querySelectorAll('.my-home .card,.my-full .card,.my-cat .card,.my-book .card');
        for (var i = 0; i < cards.length; i++) {
            var el = cards[i];
            if (on) { decorateCard(el); continue; }
            el.__myDec = false;
            var extra = el.querySelectorAll('.my-card-logo,.my-card-shade,.my-card-name');
            for (var k = 0; k < extra.length; k++) extra[k].parentNode.removeChild(extra[k]);
        }
        if (on) decoratePending(); else pendingCards = [];
    }

    function patchCardVisible() {
        var map = null;
        try { map = Lampa.Maker && Lampa.Maker.map && Lampa.Maker.map('Card'); } catch (e) { map = null; }
        if (!map || !map.Card) { warnOnce(11, 'не найден модуль Lampa.Maker Card — логотипы на карточках недоступны'); return; }
        wrap(map.Card, 'onVisible', function (orig, args) {
            var r = callOrig(orig, this, args);
            var h = this.html;
            var el = h && h.get ? h.get(0) : (h && h[0] ? h[0] : h);
            if (!halted && el && el.nodeType === 1 && (closestCls(el, 'my-home') || closestCls(el, 'my-full') || closestCls(el, 'my-cat') || closestCls(el, 'my-book'))) decorateCard(el);
            return r;
        });
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 15: встраивание в главный экран Lampa (модули Maker «Main»)
    // ---------------------------------------------------------------------------------------

    // true — найден оригинал или int-addon.js уже после встраивания (по флагам при запуске Lampa): обёртки молчат.
    var halted = false;

    function wideScreen() {
        if (document.documentElement.clientWidth < 720) return false;
        try { return !(Lampa.Platform && Lampa.Platform.screen && Lampa.Platform.screen('mobile')); } catch (e) { return true; }
    }

    // Где включается свой главный экран: не на телефоне и не в узком окне (три широкие карточки не помещаются)
    // и не в «Избранном» (там без баннера — правка 12, bookEnabled).
    function homeEnabled(object) {
        if (halted || !object || object.component === 'bookmarks' || object.title === 'Избранное') return false;
        return wideScreen();
    }

    // ПРАВКА 12: «Избранное» (просьба 14.11.2026 — «как страница „Еще“») — ряды широких карточек с подписью, без баннера.
    function bookEnabled(object) {
        return !halted && !!object && object.component === 'bookmarks' && opt('my_cat_wide', true) === true && wideScreen();
    }

    // В рядах «Избранного» широкими делаем только карточки фильмов: плитки-счётчики «Закладки / Нравится» (Register)
    // и папки «Фильмы / Сериалы» (Folder) — свои модули Lampa, их не трогаем. (Ряды остаются, только если не удалось
    // собрать три плитки — см. bookTiles.)
    function bookWideOk(el) {
        return wideOk(el) && !(el.params && (el.params.module || el.params.createInstance));
    }

    // ПРАВКА 12, «Избранное» (просьба 14.11.2026, второй вариант): только три плитки по центру экрана — «Нравится»,
    // «Позже», «Закладки»: название посередине, под ним — сколько фильмов в папке. Ряды с карточками, их заголовки и
    // ряд счётчиков вверху слева не строятся. Плитки — счётчики самой Lampa (Register): OK открывает папку, как в
    // Lampa (широкие плитки — как «Еще»). Пустой папки Lampa в ряду нет — добавляем плитку с нулём.
    var BOOK_TILES = ['like', 'wath', 'book'];

    function openFolder(type, title) {
        return function () {
            Lampa.Activity.push({ url: '', title: title, component: 'favorite', type: type, filter: '', source: Lampa.Storage.field('source'), page: 1 });
        };
    }

    function bookTiles(lines) {
        var reg = null;
        for (var i = 0; i < lines.length && !reg; i++) {
            var r = lines[i] && lines[i].results;
            if (r && r.length && r[0] && r[0].params && r[0].params.createInstance && typeof r[0].count === 'number') reg = lines[i];
        }
        if (!reg) return null;
        var byTitle = {};
        for (var j = 0; j < reg.results.length; j++) byTitle[reg.results[j].title] = reg.results[j];
        var tmpl = reg.results[0];
        var out = [];
        for (var k = 0; k < BOOK_TILES.length; k++) {
            var title = Lampa.Lang.translate('title_' + BOOK_TILES[k]);
            out.push(byTitle[title] || {
                title: title, count: 0, limit: tmpl.limit,
                params: { module: tmpl.params.module, createInstance: tmpl.params.createInstance, emit: { onEnter: openFolder(BOOK_TILES[k], title) } }
            });
        }
        reg.results = out;
        return reg;
    }

    var LINE_CARDS = 12; // сколько карточек ряд готовит сразу: три на экране и запас для листания

    // Ряд главного экрана: вместо одной большой карточки Lampa — свои широкие (кадр вместо постера).
    function prepareLine(line) {
        var p = line.params || (line.params = {});
        p.items = p.items || {};
        line.wide = false;
        line.items_per_row = p.items_per_row = p.items.view = LINE_CARDS;
        var res = line.results;
        if (!res || !res.length || !Lampa.Utils || !Lampa.Utils.extendItemsParams) return;
        for (var i = 0; i < res.length; i++) if (res[i]) res[i].wide = false;
        Lampa.Utils.extendItemsParams(res, { style: { name: 'wide' } });
    }

    function patchHome() {
        var map = null;
        try { map = Lampa.Maker && Lampa.Maker.map && Lampa.Maker.map('Main'); } catch (e) { map = null; }
        if (!map || !map.Items || !map.Create) { warnOnce(15, 'не найден модуль Lampa.Maker Main — главный экран обычный'); return false; }
        wrap(map.Items, 'onInit', function (orig, args) {
            var on = this.__myHomeOn = homeEnabled(this.object);
            this.__myBook = !on && bookEnabled(this.object);
            if (on) {                        // широкий режим Lampa (одна большая карточка) не нужен
                this.wide = false;
                if (this.object) this.object.wide = false;
            }
            return callOrig(orig, this, args);
        });
        wrap(map.Create, 'onCreate', function (orig, args) {
            var r = callOrig(orig, this, args);
            if (this.__myHomeOn && !this.__myHome) {
                try { this.__myHome = new Home(this); } catch (e) { warnOnce(15, 'баннер не создан: ' + e.message); }
            }
            if (this.__myBook) {
                try { this.render(true).classList.add('my-book'); } catch (e) { warnOnce(12, '«Избранное» не оформлено: ' + e.message); }
            }
            return r;
        });
        wrap(map.Create, 'onCreateAndAppend', function (orig, args) {
            var line = args[0];
            if (this.__myHomeOn && line) {
                try { prepareLine(line); } catch (e) { warnOnce(11, 'ряд не подготовлен: ' + e.message); }
            }
            if (this.__myBook && line && line.results && line.results.length) {
                try {
                    for (var i = 0; i < line.results.length; i++) {
                        if (bookWideOk(line.results[i])) Lampa.Utils.extendItemsParams([line.results[i]], { style: { name: 'wide' } }, true);
                    }
                } catch (e) { warnOnce(12, 'ряд «Избранного» не подготовлен: ' + e.message); }
            }
            return callOrig(orig, this, args);
        });
        wrap(map.Items, 'onDestroy', function (orig, args) {
            if (this.__myHome) { this.__myHome.destroy(); this.__myHome = null; }
            return callOrig(orig, this, args);
        });
        // «Избранное»: Lampa отдаёт все ряды разом — оставляем один ряд из трёх плиток (bookTiles).
        if (typeof map.Items.onBuild === 'function') {
            wrap(map.Items, 'onBuild', function (orig, args) {
                if (this.__myBook && args[0] && args[0].length) {
                    try {
                        var tiles = bookTiles(args[0]);
                        if (tiles) {
                            args[0] = [tiles];
                            this.render(true).classList.add('my-book--tiles');
                        }
                    } catch (e) { warnOnce(12, '«Избранное»: плитки не собраны, остаются ряды Lampa: ' + e.message); }
                }
                return callOrig(orig, this, args);
            });
        } else warnOnce(12, 'нет Lampa.Maker Main Items.onBuild — «Избранное» рядами');
        return true;
    }

    // Один обработчик фокуса на всё приложение: событие Lampa «hover:focus» не всплывает — ловим на захвате.
    // Короткий: на чужих экранах — сразу выход; тяжёлое — по таймерам после остановки.
    function onFocusCapture(e) {
        lastNav = Date.now();
        var t = e.target;
        if (!t || t.nodeType !== 1) return;
        var home = closestCls(t, 'my-home');
        if (home && home.__myHome) {
            if (hasCls(t, 'card')) home.__myHome.show(t);
            return;
        }
        var full = closestCls(t, 'my-full');
        if (full) { onFullFocus(full, t); decorateSoon(); return; }
        // ПРАВКА 1: со страницы фильма в шапку, меню «•••», окно выбора — ролик на паузе (скрыт), вернулись на
        // кнопки — продолжается. Уход на другую страницу останавливает его (событие activity).
        if (Trailer.ctx === 'full') Trailer.suspend();
        if (closestCls(t, 'my-cat') || closestCls(t, 'my-book')) decorateSoon();
    }

    // ---------------------------------------------------------------------------------------
    // Конфликт: при включённом «Стильном интерфейсе» или int-addon.js плагин не запускается
    // ---------------------------------------------------------------------------------------

    function conflicts() {
        var found = [];
        var list = [];
        try { list = Lampa.Storage.get('plugins', '[]') || []; } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var url = String((p && (p.url || p)) || '');
            var on = !(p && typeof p === 'object' && p.status === 0);
            if (!on) continue;
            if (/lampa-plugins\/int(\.lite|\.full)?\.js/i.test(url)) found.push('«Стильный интерфейс» (' + url + ')');
            if (/int-addon\.js/i.test(url)) found.push('int-addon.js (' + url + ')');
        }
        if (window.plugin_interface_ready_v3 && !found.length) found.push('«Стильный интерфейс»');
        if (window.my_int_addon_ready && found.join('').indexOf('int-addon') < 0) found.push('int-addon.js');
        return found;
    }

    // =======================================================================================
    // Правки 1, 2, 5, 6, 7, 8, 10, 12, 13: трейлер, страница фильма, рейтинги, шрифт, «Еще», шапка (код int-addon.js,
    // переделанный под самостоятельный плагин: без «Стильного интерфейса», данные — из общего запроса getInfo)
    // =======================================================================================

    // ---------------------------------------------------------------------------------------
    // ОБЩЕЕ: запросы к сторонним сервисам (MDBList, Кинопоиск, компьютер в домашней сети) и значки
    // ---------------------------------------------------------------------------------------

    function xhrJson(url, headers, ok, fail) {
        var x;
        try { x = new XMLHttpRequest(); x.open('GET', url, true); } catch (e) { fail('xhr'); return; }
        x.timeout = 9000;
        if (headers) {
            for (var h in headers) {
                if (Object.prototype.hasOwnProperty.call(headers, h)) x.setRequestHeader(h, headers[h]);
            }
        }
        x.onload = function () {
            if (x.status >= 200 && x.status < 300) {
                var json = null;
                try { json = JSON.parse(x.responseText); } catch (e) { fail('parse', ''); return; }
                ok(json);
            } else {
                // Текст ошибки от сервиса (например, «Invalid API key») — для кнопки «Проверить ключи».
                var msg = '';
                try { var j = JSON.parse(x.responseText); msg = String((j && (j.error || j.message)) || ''); } catch (e2) { msg = ''; }
                fail('http ' + x.status, msg.slice(0, 160));
            }
        };
        x.onerror = function () { fail('network', ''); };
        x.ontimeout = function () { fail('timeout', ''); };
        x.send();
    }


    // Собственные простые значки (SVG-константы; данные из сети через innerHTML не вставляются).
    var ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
    var ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 1: трейлер по кругу на странице фильма через мост YouTube самой Lampa (Lampa.Manifest.github_lampa +
    // youtube.html). На главном экране трейлеров нет (по просьбе: без загрузок YouTube при листании).
    // ---------------------------------------------------------------------------------------

    // Ролики, которые YouTube не даёт встроить (не больше 100, потом список начинается заново).
    var trailerBad = {}, trailerBadN = 0;

    function markTrailerBad(key) {
        if (trailerBadN >= 100) { trailerBad = {}; trailerBadN = 0; }
        if (!trailerBad[key]) trailerBadN++;
        trailerBad[key] = true;
    }

    // Запасной ключ ролика, если в данных страницы фильма роликов нет: из нашего кэша (без запроса).
    function cachedTrailer(data) {
        var rec = cachedInfo(data);
        var list = (rec && (rec.ts || (rec.tr ? [rec.tr] : []))) || [];
        for (var i = 0; i < list.length; i++) if (!trailerBad[list[i]]) return list[i];
        return '';
    }

    // Заставка, плеер, уход Lampa в фон: окно YouTube удаляем сразу; на кнопках страницы фильма трейлер
    // потом запустится снова.
    function stopTrailersNow() {
        clearTimeout(Full.timer);
        Trailer.stop(true);
    }

    // Страница фильма: трейлер начинает загружаться почти сразу (Lampa успевает отрисовать страницу); раньше —
    // через 2 с после открытия.
    var FULL_START_DELAY = 300;

    // В начале воспроизведения YouTube сам показывает в центре свою кнопку «❚❚» (полупрозрачный круг) и потом гасит её.
    // Замер на ТВ 14.11.2026 (кадры каждые ~0,7 с, три прогона): кнопка видна до 2,6 / 3,3 / 3,4 с от начала
    // воспроизведения — показываем после 4 с. На этапе 3 показ ускорили до 1 с, и кнопка была видна (найдено
    // пользователем); 3 с тоже мало. Проверка автотеста 1.7c ищет кнопку на кадрах страницы фильма.
    var REVEAL_AT = 4.0;
    // После «play» (возврат на кнопки с «Похожих» или из шапки) YouTube показывает ту же кнопку ещё дольше: видна до
    // 3,5–4,15 с после нажатия — открываем слой, когда ролик проиграл 5 с.
    var RESUME_REVEAL = 5.0;
    // Удаление iframe YouTube на этом ТВ подвешивает отрисовку на 0,3–0,4 с (замер). Остановленный ролик
    // стоит на паузе скрытым и удаляется при запуске следующего трейлера (пользователь в этот момент стоит на
    // карточке) или после IDLE_KILL мс без листания — не посреди переключения карточек.
    var IDLE_KILL = 6000;
    var lastNav = 0;            // время последней смены фокуса (onFocusCapture)
    var ZOOM = 1.3;             // чуть крупнее экрана — чёрные рамки широкоэкранных трейлеров уходят за край
    var WAIT_READY = 15000;     // столько ждём, пока YouTube загрузится (на слабом ТВ ~7 с)
    var WAIT_PLAY = 10000;      // после загрузки столько ждём начала воспроизведения

    var Trailer = {
        ctx: '', host: null, layer: null, box: null, frame: null,
        bridge: '', key: '',
        ready: false, revealed: false, mutedMode: false, triedMuted: false,
        revealAt: REVEAL_AT, lastTime: 0, suspended: false,
        watchdog: null, killTimer: null, pauseTimer: null, rampTimers: [],

        soundWanted: function () {
            return opt('my_trailer_sound', true) === true;
        },

        bridgeBase: function () {
            var base = '';
            try { base = Lampa.Manifest && Lampa.Manifest.github_lampa; } catch (e) { base = ''; }
            return base || '';
        },

        ensureLayer: function (host, after) {
            var layer = host.querySelector(':scope > .my-trailer');
            if (!layer) {
                layer = make('div', 'my-trailer');
                var box = make('div', 'my-trailer__box');
                layer.appendChild(box);
                layer.appendChild(make('div', 'my-trailer__shade'));
                if (after && after.parentNode === host) host.insertBefore(layer, after.nextSibling);
                else host.insertBefore(layer, host.firstChild);
            }
            return layer;
        },

        fit: function () {
            if (!this.layer || !this.box) return;
            var r = this.layer.getBoundingClientRect();
            if (!r.width || !r.height) return;
            var k = Math.max(r.width / 640, r.height / 360) * ZOOM;
            var tx = (r.width - 640 * k) / 2;
            var ty = (r.height - 360 * k) / 2;
            this.box.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
        },

        start: function (host, after, key, ctx) {
            if (halted || !key) return;
            var base = this.bridgeBase();
            if (!base) {
                warnOnce(1, 'не найден мост YouTube Lampa (Lampa.Manifest.github_lampa) — трейлеры выключены');
                return;
            }
            if (this.frame && this.key === key && this.host === host) {
                if (this.ctx) return;                // уже играет здесь
                this.revive(ctx);                    // остановлен, окно ещё живо — продолжаем с паузы
                return;
            }
            this.destroyFrame();
            this.ctx = ctx;
            this.host = host;
            this.key = key;
            this.layer = this.ensureLayer(host, after);
            this.box = this.layer.querySelector('.my-trailer__box');
            this.triedMuted = false;
            this.suspended = false;
            this.fit();
            this.load(!this.soundWanted(), 0);
        },

        load: function (muted, startAt) {
            this.removeIframeOnly();
            if (this.layer) this.layer.classList.remove('my-trailer--on');
            this.mutedMode = !!muted;
            this.ready = false;
            this.playing = false;
            this.revealed = false;
            this.revealAt = (startAt || 0) + REVEAL_AT;
            this.lastTime = startAt || 0;
            this.bridge = 'myint' + Date.now() + Math.floor(Math.random() * 1e6);
            var url = this.bridgeBase() + 'youtube.html?bridgeId=' + this.bridge +
                '&videoId=' + encodeURIComponent(this.key) +
                '&autoplay=1&controls=0&mute=' + (muted ? 1 : 0) + '&start=' + Math.floor(startAt || 0);
            var f = document.createElement('iframe');
            f.setAttribute('frameborder', '0');
            f.setAttribute('allow', 'autoplay; encrypted-media');
            f.setAttribute('tabindex', '-1');
            f.src = url;
            this.frame = f;
            this.box.appendChild(f);
            var self = this;
            clearTimeout(this.watchdog);
            this.watchdog = setTimeout(function () { self.onStall(); }, WAIT_READY);
            updateSoundIcons();
        },

        audible: function () {
            return this.soundWanted() && !(this.frame && this.mutedMode);
        },

        onStall: function () {
            if (!this.frame || this.revealed || this.playing) return;
            if (this.ready && !this.mutedMode && !this.triedMuted) {
                // YouTube загрузился, но не играет: автозапуск со звуком мог быть запрещён — пробуем без звука.
                this.triedMuted = true;
                info('трейлер не стартовал со звуком, пробую без звука');
                this.load(true, 0);
                return;
            }
            warnOnce(1, 'трейлер не запустился (YouTube не ответил) — остаётся обычный фон');
            markTrailerBad(this.key);                // при возврате на кнопки возьмём следующий ролик, а не этот
            this.stop(true);
        },

        post: function (type, data) {
            try {
                var w = this.frame && this.frame.contentWindow;
                if (w) w.postMessage({ bridgeId: this.bridge, type: type, data: data || {} }, '*');
            } catch (e) {}
        },

        onMessage: function (msg) {
            if (!msg || msg.bridgeId !== this.bridge || !this.frame) return;
            var type = msg.type, data = msg.data || {};
            // Команды, отправленные до готовности YouTube, теряются. Поэтому ролик, остановленный (ждёт удаления)
            // или спрятанный до загрузки, глушим и ставим на паузу, как только YouTube догрузился или заиграл,
            // — иначе он играл бы скрыто, а остановленный и со звуком.
            var quiet = !this.ctx || this.suspended;
            if (quiet && (type === 'ready' || (type === 'time' && data.playerState === 1))) {
                if (type === 'ready') this.ready = true;
                this.post('setVolume', { volume: 0 });
                this.post('pause');
            }
            if (!this.ctx) return;                   // остановленный не показываем снова и не крутим по кругу
            if (type === 'ready') {
                this.ready = true;
                if (!this.mutedMode) this.post('setVolume', { volume: 0 });
                var self = this;
                clearTimeout(this.watchdog);
                this.watchdog = setTimeout(function () { self.onStall(); }, WAIT_PLAY);
                return;
            }
            if (type === 'time') {
                var t = Number(data.currentTime) || 0;
                this.lastTime = t;
                if (data.playerState === 1 && !this.playing) {
                    this.playing = true;
                    clearTimeout(this.watchdog);
                }
                // После stop() ролик ещё живёт до удаления (ctx уже пуст) — не показываем его снова.
                if (!this.revealed && !this.suspended && this.ctx && data.playerState === 1 && t >= this.revealAt) this.reveal();
                return;
            }
            if (type === 'stateChange') {
                if (data.state === 0) this.loop();
                return;
            }
            if (type === 'error') {
                markTrailerBad(this.key);
                warnOnce(1, 'YouTube не даёт встроить ролик ' + this.key + ' (код ' + data.error + ')');
                this.stop(true);
            }
        },

        reveal: function () {
            clearTimeout(this.watchdog);
            this.revealed = true;
            this.layer.classList.add('my-trailer--on');
            if (!this.mutedMode && this.soundWanted()) this.ramp(100);
            else if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            updateSoundIcons();
        },

        ramp: function (target) {
            var self = this;
            this.clearRamp();
            var steps = [0.25, 0.5, 0.75, 1];
            for (var i = 0; i < steps.length; i++) {
                (function (v, delay) {
                    self.rampTimers.push(setTimeout(function () { self.post('setVolume', { volume: Math.round(target * v) }); }, delay));
                })(steps[i], i * 110);
            }
        },

        clearRamp: function () {
            for (var i = 0; i < this.rampTimers.length; i++) clearTimeout(this.rampTimers[i]);
            this.rampTimers = [];
        },

        loop: function () {
            // По кругу: прячем на время перезапуска, чтобы не было видно загрузки и значков YouTube.
            // Спрятанный (фокус не на кнопках) — только в начало, без воспроизведения: продолжит resume.
            if (this.suspended) { this.post('seekTo', { time: 0 }); this.post('pause'); this.lastTime = 0; return; }
            this.revealed = false;
            this.layer.classList.remove('my-trailer--on');
            if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            this.revealAt = RESUME_REVEAL;        // после «play» кнопка YouTube видна дольше, чем при автозапуске
            this.post('seekTo', { time: 0 });
            this.post('play');
        },

        // Пауза YouTube показывает свой значок «❚❚» — поэтому сначала убираем звук и прячем слой,
        // а саму паузу ставим, когда ролика уже не видно (слой гаснет за 240 мс).
        pauseHidden: function () {
            var self = this;
            var bridge = this.bridge;
            clearTimeout(this.pauseTimer);
            this.pauseTimer = setTimeout(function () {
                if (self.frame && self.bridge === bridge && !self.revealed) self.post('pause');
            }, 300);
        },

        suspend: function () {
            if (!this.frame || this.suspended) return;
            this.suspended = true;
            this.clearRamp();
            if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            this.layer.classList.remove('my-trailer--on');
            this.revealed = false;
            this.pauseHidden();
        },

        resume: function () {
            if (!this.frame || !this.suspended) return;
            this.suspended = false;
            clearTimeout(this.pauseTimer);
            // После «play» YouTube тоже показывает значок — открываем слой, когда он уже погас.
            this.revealAt = this.lastTime + RESUME_REVEAL;
            if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            this.post('play');
        },

        toggleSound: function () {
            if (Trailer.audible()) {
                Lampa.Storage.set('my_trailer_sound', false);
                Trailer.clearRamp();
                if (Trailer.frame) Trailer.post('setVolume', { volume: 0 });
            } else {
                Lampa.Storage.set('my_trailer_sound', true);
                if (Trailer.frame) {
                    if (Trailer.mutedMode) {
                        // Начато без звука: перезапускаем со звуком с того же места (есть нажатие пользователя).
                        var at = Trailer.lastTime;
                        Trailer.triedMuted = true;
                        Trailer.load(false, at);
                    } else if (Trailer.revealed) Trailer.ramp(100);
                }
            }
            updateSoundIcons();
        },

        stop: function (immediate) {
            clearTimeout(this.watchdog);
            this.clearRamp();
            if (!this.frame) { this.ctx = ''; return; }
            if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            if (this.layer) this.layer.classList.remove('my-trailer--on');
            this.revealed = false;
            this.pauseHidden();
            var self = this;
            clearTimeout(this.killTimer);
            if (immediate) this.destroyFrame();
            else {
                var check = function () {
                    if (!self.frame || self.ctx) return;
                    var idle = Date.now() - lastNav;
                    if (idle >= IDLE_KILL) self.destroyFrame();
                    else self.killTimer = setTimeout(check, IDLE_KILL - idle + 50);
                };
                this.killTimer = setTimeout(check, IDLE_KILL);
            }
            this.ctx = '';
        },

        removeIframeOnly: function () {
            if (!this.frame) return;
            this.post('destroy');
            try { this.frame.src = 'about:blank'; } catch (e) {}
            if (this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
            this.frame = null;
            this.bridge = '';
        },

        // Вернулись к тому же фильму (назад со страницы торрентов и т. п.), пока остановленное окно YouTube ещё
        // живо: не грузим ролик заново, а продолжаем с паузы. Слой откроется, когда значок «play» YouTube уже
        // погаснет (как в resume).
        revive: function (ctx) {
            clearTimeout(this.killTimer);
            clearTimeout(this.pauseTimer);
            this.ctx = ctx;
            this.suspended = false;
            this.revealed = false;
            this.revealAt = this.lastTime + RESUME_REVEAL;
            if (!this.mutedMode) this.post('setVolume', { volume: 0 });
            this.post('play');
        },

        destroyFrame: function () {
            clearTimeout(this.killTimer);
            clearTimeout(this.watchdog);
            this.clearRamp();
            this.removeIframeOnly();
            if (this.layer) this.layer.classList.remove('my-trailer--on');
            this.revealed = false;
            this.key = '';
            this.host = null;
            this.layer = null;                       // закрытая страница не держится в памяти
            this.box = null;
        }
    };

    function updateSoundIcons() {
        var on = Trailer.audible();
        var list = document.querySelectorAll('.my-btn--sound');
        for (var i = 0; i < list.length; i++) {
            var holder = list[i].querySelector('.my-ico') || list[i];
            holder.innerHTML = on ? ICON_SOUND_ON : ICON_SOUND_OFF;
        }
    }


    // ---------------------------------------------------------------------------------------
    // ПРАВКА 7: рейтинги — только на странице фильма; кэш 2000 фильмов на неделю (неудача — сутки)
    // ---------------------------------------------------------------------------------------

    var rateStore = new LimitedStore('my_rates_cache', 2000);
    var ratePausedUntil = 0;   // сервис ответил «лимит исчерпан» — до этого времени не спрашиваем
    var rateWaiting = {};
    var RATE_TTL = 7 * 24 * 3600 * 1000;
    var RATE_TTL_FAIL = 24 * 3600 * 1000;

    function rateKeys() {
        // Пробелы и переводы строк, случайно попавшие при наборе на экранной клавиатуре, убираем.
        return {
            kp: String(opt('my_kp_key', '') || '').replace(/\s+/g, ''),
            mdb: String(opt('my_mdb_key', '') || '').replace(/\s+/g, '')
        };
    }

    // Отпечаток ключей: если ключ поменяли, старые ответы (и неудачи) в кэше не используются.
    function keysHash() {
        var k = rateKeys();
        var s = k.mdb + '|' + k.kp;
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return String(h);
    }

    function isAuthError(why) {
        return /^http (401|402|403|429)$/.test(String(why || ''));
    }

    function getRatings(data, cb) {
        if (!sourceOk(data)) { cb({}); return; }
        var keys = rateKeys();
        var needMdb = !!keys.mdb && (opt('my_rate_imdb', true) || opt('my_rate_tomatoes', true) || opt('my_rate_popcorn', true));
        var needKp = !!keys.kp && (opt('my_rate_kp', true) || (opt('my_rate_imdb', true) && !keys.mdb));
        if (!needMdb && !needKp) { cb({}); return; }

        var type = mediaType(data);
        var id = type + '_' + data.id;
        var cached = rateStore.get(id);
        var now = Date.now();
        var hash = keysHash();
        if (cached && cached.t && (now - cached.t) < (cached.f ? RATE_TTL_FAIL : RATE_TTL) && cached.k === (needMdb ? 1 : 0) + (needKp ? 2 : 0) && cached.h === hash) {
            cb(cached.r || {});
            return;
        }
        if (now < ratePausedUntil) { cb({}); return; }
        if (rateWaiting[id]) { rateWaiting[id].push(cb); return; }
        rateWaiting[id] = [cb];

        var result = {};
        var failed = false;
        var authFailed = false;
        var imdbId = data.imdb_id || (data.external_ids && data.external_ids.imdb_id) || '';

        var finish = function () {
            // Ключ не принят или исчерпан лимит — не запоминаем, чтобы после исправления ключа сразу заработало.
            if (!authFailed) {
                rateStore.set(id, { t: Date.now(), r: result, f: failed && !result.imdb && !result.kp && !result.tomatoes ? 1 : 0, k: (needMdb ? 1 : 0) + (needKp ? 2 : 0), h: hash });
            }
            var list = rateWaiting[id] || [];
            delete rateWaiting[id];
            for (var i = 0; i < list.length; i++) list[i](result);
        };

        var doKp = function () {
            if (!needKp) { finish(); return; }
            var withImdb = function (imdb) {
                if (!imdb) { finish(); return; }
                xhrJson('https://kinopoiskapiunofficial.tech/api/v2.2/films?imdbId=' + encodeURIComponent(imdb), { 'X-API-KEY': keys.kp }, function (json) {
                    var it = json && json.items && json.items[0];
                    if (it) {
                        if (it.ratingKinopoisk) result.kp = Number(it.ratingKinopoisk);
                        if (!result.imdb && it.ratingImdb) result.imdb = Number(it.ratingImdb);
                    }
                    finish();
                }, function (why) {
                    failed = true;
                    if (isAuthError(why)) authFailed = true;
                    if (/^http (402|429)$/.test(String(why))) ratePausedUntil = Date.now() + 3600000;
                    warnOnce(7, 'Кинопоиск не ответил (' + why + ') — проверьте ключ в «Мой интерфейс»');
                    finish();
                });
            };
            if (imdbId) withImdb(imdbId);
            // id IMDb — из того же запроса TMDB, что и баннер (append_to_response=external_ids), обычно уже в кэше.
            else getInfo(data, function (rec) {
                if (!rec) failed = true;             // TMDB не ответил — пустой результат помним сутки, не неделю
                withImdb((rec && rec.im) || '');
            }, true);
        };

        if (needMdb) {
            xhrJson('https://api.mdblist.com/tmdb/' + (type === 'tv' ? 'show' : 'movie') + '/' + data.id + '?apikey=' + encodeURIComponent(keys.mdb), null, function (json) {
                var list = (json && json.ratings) || [];
                for (var i = 0; i < list.length; i++) {
                    var r = list[i] || {};
                    var src = String(r.source || '').toLowerCase();
                    var val = r.value;
                    if (val === null || val === undefined || val === '' || isNaN(Number(val))) continue;
                    if (src === 'imdb') result.imdb = Number(val);
                    else if (src === 'tomatoes') result.tomatoes = Number(val);
                    else if (src === 'popcorn' || src === 'tomatoesaudience') result.popcorn = Number(val);
                }
                if (!imdbId) imdbId = (json && json.ids && json.ids.imdb) || (json && json.imdbid) || '';
                doKp();
            }, function (why) {
                failed = true;
                if (isAuthError(why)) authFailed = true;
                if (/^http (402|429)$/.test(String(why))) ratePausedUntil = Date.now() + 3600000;
                warnOnce(7, 'MDBList не ответил (' + why + ') — проверьте ключ в «Мой интерфейс»');
                doKp();
            });
        } else doKp();
    }

    function explainFail(why, msg) {
        var s = String(why || '');
        var tail = msg ? ' Ответ сервиса: «' + msg + '».' : '';
        if (s === 'http 401') return 'ключ не принят (401). Проверьте, что он введён без ошибок: большие и маленькие буквы различаются.' + tail;
        if (s === 'http 403') return 'доступ запрещён (403): ключ не активирован или у аккаунта нет доступа к API.' + tail;
        if (s === 'http 402' || s === 'http 429') return 'исчерпан лимит запросов на сегодня (' + s.slice(5) + ').' + tail;
        if (s === 'network' || s === 'timeout') return 'нет связи с сервисом (' + s + ').';
        return 'ошибка ' + s + '.' + tail;
    }

    // ПРАВКА 7: кнопка «Проверить ключи» — пробный запрос по «Бойцовскому клубу» (TMDB 550, IMDb tt0137523).
    // Ключи на экран не выводятся — только их длина.
    function checkKeys() {
        var k = rateKeys();
        if (!k.mdb && !k.kp) { Lampa.Noty.show('Ключи не введены'); return; }
        rateStore.data = { o: [], m: {} };
        try { window.localStorage.removeItem('my_rates_cache'); } catch (e) {}
        var lines = [];
        var left = 0;
        var done = function () {
            if (--left > 0) return;
            var box = make('div', 'my-details');
            for (var i = 0; i < lines.length; i++) box.appendChild(make('div', 'my-details__row', lines[i]));
            box.appendChild(make('div', 'my-details__row', 'Кэш рейтингов очищен — рейтинги загрузятся заново.'));
            Lampa.Modal.open({
                title: 'Проверка ключей',
                html: $(box),
                size: 'medium',
                onBack: function () {
                    Lampa.Modal.close();
                    Lampa.Controller.toggle('settings_component');
                }
            });
        };
        Lampa.Noty.show('Проверяю ключи…');
        if (k.mdb) {
            left++;
            xhrJson('https://api.mdblist.com/tmdb/movie/550?apikey=' + encodeURIComponent(k.mdb), null, function (json) {
                var r = {};
                var list = (json && json.ratings) || [];
                for (var i = 0; i < list.length; i++) {
                    var src = String((list[i] || {}).source || '').toLowerCase();
                    if (list[i].value !== null && list[i].value !== undefined) r[src] = list[i].value;
                }
                lines.push('MDBList (ключ ' + k.mdb.length + ' симв.): работает. «Бойцовский клуб»: IMDb ' + (r.imdb || '—') + ', 🍅 ' + (r.tomatoes || '—') + '%, 🍿 ' + (r.popcorn || '—') + '%.');
                done();
            }, function (why, msg) {
                lines.push('MDBList (ключ ' + k.mdb.length + ' симв.): ' + explainFail(why, msg));
                done();
            });
        }
        if (k.kp) {
            left++;
            xhrJson('https://kinopoiskapiunofficial.tech/api/v2.2/films?imdbId=tt0137523', { 'X-API-KEY': k.kp }, function (json) {
                var it = json && json.items && json.items[0];
                lines.push('Кинопоиск (ключ ' + k.kp.length + ' симв.): работает. «Бойцовский клуб»: КП ' + ((it && it.ratingKinopoisk) || '—') + '.');
                done();
            }, function (why, msg) {
                lines.push('Кинопоиск (ключ ' + k.kp.length + ' симв.): ' + explainFail(why, msg));
                done();
            });
        }
    }

    // Адрес компьютера в домашней сети, с которого загружен плагин (или из поля «Адрес папки со шрифтом»).
    function lanRoot() {
        var list = [];
        try { list = Lampa.Storage.get('plugins', '[]') || []; } catch (e) { list = []; }
        if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e2) { list = []; } }
        for (var i = 0; i < list.length; i++) {
            var url = String((list[i] && (list[i].url || list[i])) || '');
            if (/(my-interface|int-addon)\.js/.test(url) && /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.)/.test(url)) {
                return url.replace(/(my-interface|int-addon)\.js.*$/, '');
            }
        }
        var font = String(opt('my_font_src', '') || '').trim();
        if (font) return font.replace(/sf-pro-display\/?$/, '').replace(/([^\/])$/, '$1/');
        return '';
    }

    // ПРАВКА 7: ключи рейтингов из файла keys.local.json на компьютере (чтобы не набирать их пультом).
    // Файл заполняет сам пользователь; в GitHub он не попадает (.gitignore). Пустые поля не трогают уже
    // введённые ключи. Значения ключей на экран не выводятся.
    function importKeys() {
        var root = lanRoot();
        if (!root) { Lampa.Noty.show('Не знаю адрес компьютера: заполните «Адрес папки со шрифтом» или загрузите плагин с компьютера'); return; }
        Lampa.Noty.show('Загружаю ключи с компьютера…');
        xhrJson(root + 'keys.local.json?' + Date.now(), null, function (json) {
            var got = [];
            var kp = String((json && json.kp) || '').replace(/\s+/g, '');
            var mdb = String((json && json.mdb) || '').replace(/\s+/g, '');
            if (kp) { Lampa.Storage.set('my_kp_key', kp); got.push('Кинопоиск'); }
            if (mdb) { Lampa.Storage.set('my_mdb_key', mdb); got.push('MDBList'); }
            maskKeyFields();
            if (!got.length) { Lampa.Noty.show('В keys.local.json нет ключей — впишите их и сохраните файл'); return; }
            Lampa.Noty.show('Ключи загружены: ' + got.join(', '));
            setTimeout(checkKeys, 800);
        }, function (why) {
            Lampa.Noty.show('Не удалось загрузить keys.local.json (' + why + '). Запущен ли scripts/serve-local.py?');
        });
    }

    // Ключи в списке настроек показываем скрытыми («введён, N символов»).
    function maskKeyFields() {
        var names = ['my_mdb_key', 'my_kp_key'];
        for (var i = 0; i < names.length; i++) {
            var el = document.querySelector('.settings-param[data-name="' + names[i] + '"] .settings-param__value');
            if (!el) continue;
            var v = String(opt(names[i], '') || '').replace(/\s+/g, '');
            el.textContent = v ? 'введён (' + v.length + ' символов)' : 'не введён';
        }
    }

    function parseShortNumber(s) {
        s = String(s || '').replace(',', '.').replace(/\s/g, '');
        var m = s.match(/^([\d.]+)([KkMmКкМм]?)/);
        if (!m) return 0;
        var n = parseFloat(m[1]) || 0;
        var suf = m[2].toLowerCase();
        if (suf === 'k' || suf === 'к') n *= 1000;
        if (suf === 'm' || suf === 'м') n *= 1000000;
        return n;
    }

    // CUB %: доля реакций 🔥 и 👍 среди всех реакций, которые Lampa уже показала (без запросов).
    function cubPercent(reactionsEl) {
        if (!reactionsEl) return null;
        var items = reactionsEl.querySelectorAll('.reaction');
        if (!items.length) return null;
        var pos = 0, total = 0;
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var cnt = parseShortNumber((el.querySelector('.reaction__count') || {}).textContent);
            total += cnt;
            if (hasCls(el, 'reaction--fire') || hasCls(el, 'reaction--nice')) pos += cnt;
        }
        if (!total) return null;
        return Math.round(pos * 100 / total);
    }

    function rateChip(kind, label, value) {
        var chip = make('span', 'my-rate my-rate--' + kind);
        chip.appendChild(make('span', 'my-rate__src', label));
        chip.appendChild(make('span', 'my-rate__val', value));
        return chip;
    }

    function fmt10(v) {
        var n = Number(v);
        if (!n || isNaN(n)) return '';
        return (n >= 10 ? 10 : n).toFixed(1);
    }

    // Порядок как на образце: IMDb, TMDB, Кинопоиск, 🍅, 🍿, CUB.
    function fillRates(holder, r, tmdbValue, cub) {
        while (holder.firstChild) holder.removeChild(holder.firstChild);
        r = r || {};
        if (opt('my_rate_imdb', true) && fmt10(r.imdb)) holder.appendChild(rateChip('imdb', 'IMDb', fmt10(r.imdb)));
        if (tmdbValue !== null && tmdbValue !== undefined && opt('my_rate_tmdb', true) && fmt10(tmdbValue)) holder.appendChild(rateChip('tmdb', 'TMDB', fmt10(tmdbValue)));
        if (opt('my_rate_kp', true) && fmt10(r.kp)) holder.appendChild(rateChip('kp', 'КП', fmt10(r.kp)));
        if (opt('my_rate_tomatoes', true) && r.tomatoes) holder.appendChild(rateChip('tomatoes', '🍅', Math.round(r.tomatoes) + '%'));
        if (opt('my_rate_popcorn', true) && r.popcorn) holder.appendChild(rateChip('popcorn', '🍿', Math.round(r.popcorn) + '%'));
        if (opt('my_rate_cub', true) && cub !== null && cub !== undefined) holder.appendChild(rateChip('cub', 'CUB', cub + '%'));
        holder.style.display = holder.firstChild ? '' : 'none';
    }


    // ---------------------------------------------------------------------------------------
    // ПРАВКА 6: страница фильма
    // ---------------------------------------------------------------------------------------

    var Full = { root: null, data: null, timer: null };
    var observers = [];

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }

    function styleStatusEl(el, code, tv) {
        var look = statusLook(code, tv);
        if (!look) return false;
        el.className = 'my-status my-status--' + look[0];
        el.textContent = look[1];
        return true;
    }

    // Ряды страницы по образцу (просьба 14.11.2026): сериал — «Эпизоды → Похожие → Актёры», фильм — «Похожие →
    // Актёры»; коллекция — после «Похожих», режиссёры и прочее — ниже. «Рекомендации», «Подробно» (description) и
    // «Комментарии» (discuss) не строятся вовсе — Lampa их не создаёт и не грузит картинки.
    function reorderRows(rows, data) {
        if (!rows || !rows.length) return;
        var tActors = '';
        try { tActors = Lampa.Lang.translate('title_actors'); } catch (e) {}
        var first = [], eps = [], simi = [], coll = [], actors = [], rest = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var name = typeof r === 'string' ? r : r[0];
            var d = typeof r === 'string' ? null : r[1];
            if (name === 'description' || name === 'discuss') continue;
            if (name === 'cards' && d && d === data.recomend) continue;
            if (name === 'start') first.push(r);
            else if (name === 'episodes') { prepareEpisodes(d); eps.push(r); }
            else if (name === 'cards' && d && d === data.simular) simi.push(r);
            else if (name === 'cards' && d && d === data.collection) coll.push(r);
            else if (name === 'persons' && d && d.title === tActors) actors.push(r);
            else rest.push(r);
        }
        var out = first.concat(eps, simi, coll, actors, rest);
        rows.length = 0;
        for (var j = 0; j < out.length; j++) rows.push(out[j]);
    }

    // «Эпизоды»: заголовок как на образце, номер сезона — рядом мелко. Lampa показывает последний сезон и сама
    // переворачивает список (новые первыми) — переворачиваем заранее, чтобы серии шли по порядку 1, 2, 3…
    function prepareEpisodes(d) {
        if (!d || d.__my || !d.results) return;
        d.__my = true;
        var first = d.results[0];
        d.my_season = first && first.season_number ? 'Сезон ' + first.season_number : '';
        d.title = 'Эпизоды';
        d.results.reverse();
    }

    var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    function dayMonth(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return '';
        var s = parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1];
        return parseInt(m[1], 10) === new Date().getFullYear() ? s : s + ' ' + m[1];
    }

    // Подпись серии: вышедшая — длительность (как на образце), будущая — дата выхода.
    function episodeSub(d) {
        if (d.comeing) return d.air_date ? 'Выйдет ' + dayMonth(d.air_date) : 'Скоро';
        if (d.runtime) return d.runtime + ' мин';
        return dayMonth(d.air_date);
    }

    function decorateEpisode(item) {
        var html = null;
        try { html = item && item.render ? item.render(true) : null; } catch (e) { html = null; }
        if (!html || html.nodeType !== 1 || !hasCls(html, 'full-episode') || html.__myEp) return;
        html.__myEp = true;
        var d = item.data || {};
        var num = d.episode_number || '';
        var img = html.querySelector('.full-episode__img');
        if (img) {
            img.appendChild(make('div', 'my-ep-shade'));
            if (num) img.appendChild(make('div', 'my-ep-num', num));
        }
        var cap = make('div', 'my-ep-cap');
        cap.appendChild(make('div', 'my-ep-cap__title', (num ? num + '. ' : '') + (d.name || d.title || ('Серия ' + num))));
        var sub = episodeSub(d);
        if (sub) cap.appendChild(make('div', 'my-ep-cap__sub', sub));
        html.appendChild(cap);
    }

    // Ряд «Эпизоды»: подписи к сериям и плитка «Все сезоны» в конце ряда (Lampa ставит свою «Еще» первой).
    // Lampa досоздаёт серии при листании — после каждой новой серии плитка снова уходит в конец.
    function decorateEpisodes(line, data) {
        var el = line.render(true);
        if (!el || el.__myEps) return;
        el.__myEps = true;
        el.classList.add('my-eps');
        var title = el.querySelector('.items-line__title');
        if (title && data && data.my_season) title.appendChild(make('span', 'my-ep-season', data.my_season));
        var more = el.querySelector('.card-more');
        if (more) {
            var mt = more.querySelector('.card-more__title');
            if (mt) mt.textContent = 'Все сезоны';
        }
        var toEnd = function () {
            if (more && more.parentNode && more.parentNode.lastChild !== more) more.parentNode.appendChild(more);
        };
        var items = line.items || [];
        for (var i = 0; i < items.length; i++) decorateEpisode(items[i]);
        toEnd();
        if (typeof line.use === 'function') {
            line.use({ onPush: function (item) { decorateEpisode(item); toEnd(); } });
        }
    }

    function onFullStart(e) {
        if (halted || opt('my_hero', true) !== true) { Full.root = null; Full.data = null; return; }
        var root = e.body && e.body[0];
        var data = e.data || {};
        if (!root) { warnOnce(6, 'событие full:start без разметки страницы'); return; }
        root.classList.add('my-full');
        Full.root = root;
        Full.data = data;

        // «Похожие», «Рекомендации», коллекция — широкие карточки (кадр вместо постера).
        var keys = ['simular', 'recomend', 'collection'];
        for (var i = 0; i < keys.length; i++) {
            var block = data[keys[i]];
            if (block && block.results && block.results.length && Lampa.Utils && Lampa.Utils.extendItemsParams) {
                Lampa.Utils.extendItemsParams(block.results, { style: { name: 'wide' } });
            }
        }

        // Порядок рядов: Похожие → Рекомендации → Актёры, остальное ниже. Меняем только у этой страницы.
        var link = e.link;
        if (link && typeof link.build === 'function' && link.rows) {
            var orig = link.build;
            link.build = function (rows) {
                link.build = orig;
                try {
                    reorderRows(link.rows, data);
                    rows = link.rows.slice(0, link.view || link.rows.length);
                } catch (err) { warnOnce(6, 'не удалось поменять порядок рядов: ' + err.message); }
                return orig.call(link, rows);
            };
        } else warnOnce(6, 'у страницы фильма нет build/rows — порядок рядов обычный');
    }

    function onFullBuild(e) {
        // Страница — из самого события: после возврата со второго фильма на первый Full.root уже сброшен, а Lampa
        // достраивает ряды первого при листании.
        var page = e.body && e.body[0];
        if (halted || !page || !hasCls(page, 'my-full')) return;
        if (e.name === 'episodes' && e.item) {
            try { decorateEpisodes(e.item, e.data); } catch (err) { warnOnce(6, 'ряд «Эпизоды» не оформлен: ' + err.message); }
            return;
        }
        if (e.name !== 'cards' || !e.item) return;
        var el = null;
        try { el = e.item.render(true); } catch (err) { el = null; }
        if (el) {
            var cards = el.querySelectorAll('.card');
            for (var i = 0; i < cards.length; i++) decorateCard(cards[i], true);
        }
        if (typeof e.item.use === 'function') {
            e.item.use({
                onInstance: function (card) {
                    setTimeout(function () {
                        try { decorateCard(card.render(true), true); } catch (err) {}
                    }, 0);
                }
            });
        }
    }

    function heroButton(cls, icon, text) {
        var b = make('div', 'full-start__button selector my-btn ' + cls);
        var ico = make('span', 'my-ico');
        ico.innerHTML = icon;
        b.appendChild(ico);
        if (text) b.appendChild(make('span', '', text));
        return b;
    }

    function onFullComplite(e) {
        if (halted || !Full.root || opt('my_hero', true) !== true) return;
        var root = Full.root;
        var data = e.data || Full.data || {};
        var movie = data.movie || {};
        var start = root.querySelector('.full-start-new');
        if (!start) { warnOnce(6, 'не найден .full-start-new — новая страница фильма не применена'); return; }
        var right = start.querySelector('.full-start-new__right');
        var title = start.querySelector('.full-start-new__title');
        var buttons = start.querySelector('.full-start-new__buttons');
        if (!right || !title || !buttons) { warnOnce(6, 'разметка страницы фильма изменилась (нет __right/__title/__buttons)'); return; }
        if (start.__my_done) return;
        start.__my_done = true;
        var tv = isTv(movie);

        // Фон на весь экран + затемнение слева и снизу.
        var bg = root.querySelector('.full-start__background');
        var shade = make('div', 'my-hero-shade');
        if (bg && bg.parentNode === root) root.insertBefore(shade, bg.nextSibling);
        else root.insertBefore(shade, root.firstChild);

        // Логотип вместо названия: из данных страницы (Lampa загружает логотипы вместе с ней), иначе — из того же
        // кэша и запроса, что у баннера главного экрана.
        var setLogo = function (url) {
            if (!url) return;
            var logo = new Image();
            logo.className = 'my-hero-logo';
            logo.alt = '';
            logo.onload = function () {
                if (!inDoc(title)) return;
                title.textContent = '';
                title.appendChild(logo);
                title.classList.add('my-hero-title--logo');
            };
            logo.src = url;
        };
        var logoPath = pickLogoPath(movie.images && movie.images.logos);
        if (logoPath) setLogo(tmdbImage(logoPath, 'w500'));
        else if (sourceOk(movie)) getInfo(movie, function (r) { if (r && r.lg) setLogo(tmdbImage(r.lg, 'w500')); }, true);

        // Строка «год · длительность · жанры · возраст · статус».
        var meta = make('div', 'my-hero-meta');
        var parts = [];
        var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
        if (year) parts.push(make('span', '', year));
        if (movie.runtime) parts.push(make('span', '', movie.runtime + ' мин'));
        else if (movie.number_of_seasons) parts.push(make('span', '', movie.number_of_seasons + ' ' + plural(movie.number_of_seasons, 'сезон', 'сезона', 'сезонов')));
        var gn = (movie.genres || []).slice(0, 3).map(function (g) { return capFirst(g.name); }).join(', ');
        if (gn) parts.push(make('span', '', gn));
        var pg = '';
        try { pg = Lampa.Api.sources.tmdb.parsePG(movie) || ''; } catch (err) { pg = ''; }
        if (pg) parts.push(make('span', '', pg));
        for (var i = 0; i < parts.length; i++) {
            if (i) meta.appendChild(make('span', 'my-hero-dot', '·'));
            meta.appendChild(parts[i]);
        }
        if (movie.status) {
            var st = make('span', '', movie.status);
            if (styleStatusEl(st, movie.status, tv)) {
                if (parts.length) meta.appendChild(make('span', 'my-hero-dot', '·'));
                meta.appendChild(st);
            }
        }
        title.parentNode.insertBefore(meta, title.nextSibling);

        // Описание в три строки.
        var descr = make('div', 'my-hero-descr', movie.overview || '');
        meta.parentNode.insertBefore(descr, meta.nextSibling);
        var anchor = descr;

        // «Продюсеры: …» — до четырёх имён из данных страницы.
        var crew = (data.persons && data.persons.crew) || [];
        var seen = {}, names = [];
        for (var c = 0; c < crew.length && names.length < 4; c++) {
            if (crew[c] && crew[c].job === 'Producer' && crew[c].name && !seen[crew[c].name]) {
                seen[crew[c].name] = true;
                names.push(crew[c].name);
            }
        }
        if (names.length) {
            var crewEl = make('div', 'my-hero-crew', 'Продюсеры: ');
            crewEl.appendChild(make('span', '', names.join(', ')));
            anchor.parentNode.insertBefore(crewEl, anchor.nextSibling);
            anchor = crewEl;
        }

        // ПРАВКА 7: рейтинги + реакции Lampa одной строкой.
        var line = make('div', 'my-hero-line');
        var rates = make('span', 'my-rates');
        line.appendChild(rates);
        anchor.parentNode.insertBefore(line, anchor.nextSibling);
        var reactions = start.querySelector('.full-start-new__reactions');
        if (reactions) line.appendChild(reactions);
        var lastRates = null;
        var redraw = function () {
            fillRates(rates, lastRates, movie.vote_average, opt('my_rate_cub', true) ? cubPercent(reactions) : null);
        };
        redraw();
        if (reactions && typeof MutationObserver !== 'undefined') {
            // Реакции Lampa догружает позже — пересчитываем CUB %. Наблюдатель только за блоком реакций и
            // отключается, когда страницу закрыли (pruneObservers).
            var mo = new MutationObserver(function () { redraw(); });
            mo.observe(reactions, { childList: true, subtree: true });
            reactions.__myMo = mo;
            observers.push(reactions);
        }
        getRatings({ id: movie.id, name: tv ? (movie.name || '1') : undefined, imdb_id: movie.imdb_id, external_ids: movie.external_ids, source: movie.source || 'tmdb' }, function (r) {
            lastRates = r;
            if (inDoc(rates)) redraw();
        });

        // Кнопки (просьба 14.11.2026): «Смотреть», «Избранное», «Подписаться» (у сериалов), звук трейлера. Кнопок
        // «Трейлер» и (i) больше нет, «•••» спрятана стилем; трейлер играет на фоне страницы (правка 1).
        var hasVideos = !!(data.videos && data.videos.results && data.videos.results.length);

        // Ролики от лучшего к худшему: если YouTube не даст встроить первый, при возврате на кнопки — следующий.
        var trailerKeys = hasVideos ? rankTrailers(data.videos.results) : [];
        if (!trailerKeys.length && cachedTrailer(movie)) trailerKeys = [cachedTrailer(movie)];
        var trailerKey = trailerKeys[0] || '';
        if (trailerKey && opt('my_trailer_full', true)) {
            var sBtn = heroButton('my-btn--sound', Trailer.audible() ? ICON_SOUND_ON : ICON_SOUND_OFF, '');
            $(sBtn).on('hover:enter', function () { Trailer.toggleSound(); });
            var opts = buttons.querySelector('.button--options');
            if (opts && opts.parentNode === buttons) buttons.insertBefore(sBtn, opts);
            else buttons.appendChild(sBtn);

            // ПРАВКА 6 + 1: трейлер на фоне страницы фильма, по кругу.
            root.__my_keys = trailerKeys;
            root.__my_bg = bg && bg.parentNode === root ? bg : null;
            clearTimeout(Full.timer);
            Full.timer = setTimeout(function () {
                if (Full.root !== root || !inDoc(root) || !heroFocused(root)) return;   // ушли в «Похожие» — позже
                Trailer.start(root, bg && bg.parentNode === root ? bg : null, trailerKey, 'full');
            }, FULL_START_DELAY);
        }
    }

    function usableKey(keys) {
        for (var i = 0; keys && i < keys.length; i++) if (!trailerBad[keys[i]]) return keys[i];
        return '';
    }

    // Фокус на кнопках вверху страницы фильма (трейлер играет только тогда — «пока выбраны кнопки»).
    function heroFocused(root) {
        return !!root.querySelector('.full-start-new .focus');
    }

    function onFullFocus(root, target) {
        var inHero = !!closestCls(target, 'full-start-new');
        if (Trailer.ctx === 'full' && Trailer.host === root) {
            if (inHero) Trailer.resume();
            else Trailer.suspend();
            return;
        }
        // Фокус встал на кнопки (страница только открылась или вернулись назад из другой) — запускаем трейлер:
        // первый ролик, который YouTube ещё не отказался встроить (нет таких — без трейлера).
        var key = inHero && !Trailer.ctx && opt('my_trailer_full', true) ? usableKey(root.__my_keys) : '';
        if (key) {
            clearTimeout(Full.timer);
            Full.timer = setTimeout(function () {
                if (!inDoc(root) || Trailer.ctx || !heroFocused(root)) return;
                Trailer.start(root, root.__my_bg || null, key, 'full');
            }, FULL_START_DELAY);
        }
    }

    // ПРАВКА 6: «Смотреть» сразу открывает торренты. Событие Lampa не всплывает, поэтому
    // перехватываем его на фазе захвата и вместо меню источников нажимаем кнопку торрентов.
    function onEnterCapture(e) {
        var t = e.target;
        if (halted || !t || !hasCls(t, 'button--play')) return;
        if (!opt('my_watch_torrents', true)) return;
        var start = closestCls(t, 'full-start-new');
        if (!start) return;
        var tor = start.querySelector('.view--torrent');
        if (!tor || hasCls(tor, 'hide')) return;    // торрентов нет — обычное меню Lampa
        e.stopPropagation();
        Trailer.stop(true);
        $(tor).trigger('hover:enter');
    }


    function pruneObservers() {
        for (var i = observers.length - 1; i >= 0; i--) {
            var el = observers[i];
            if (inDoc(el)) continue;
            try { el.__myMo.disconnect(); } catch (e) {}
            el.__myMo = null;
            observers.splice(i, 1);
        }
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 12: страница «Еще» — Lampa создаёт карточки раздела в модуле Category (Create.onCreateAndAppend).
    // Перед созданием просим у Lampa широкую карточку (кадр вместо постера), корню страницы — класс my-cat.
    // ---------------------------------------------------------------------------------------

    function wideOk(el) {
        if (!el || typeof el !== 'object' || !(el.title || el.name)) return false;
        if (el.known_for_department || (el.profile_path && !el.poster_path && !el.backdrop_path)) return false; // актёры
        if (el.params && el.params.style && el.params.style.name === 'collection') return false;
        return true;
    }

    // «category_full» — «Еще» у обычных рядов; «recomend» — у «Рекомендуем посмотреть» (Lampa там сама кладёт
    // широкие карточки в сетку по 6, и они налезают друг на друга); «favorite» — «История» из меню и «Еще» у рядов
    // «Избранного» (просьба 14.11.2026).
    var CAT_PAGES = { category_full: true, recomend: true, favorite: true };

    function patchCategory() {
        var map = null;
        try { map = Lampa.Maker && Lampa.Maker.map && Lampa.Maker.map('Category'); } catch (e) { map = null; }
        if (!map || !map.Create || typeof map.Create.onCreateAndAppend !== 'function') {
            warnOnce(12, 'не найден модуль Lampa.Maker Category — страница «Еще» остаётся обычной');
            return;
        }
        wrap(map.Create, 'onCreateAndAppend', function (orig, args) {
            var el = args[0];
            try {
                if (!halted && opt('my_cat_wide', true) === true && this.object && CAT_PAGES[this.object.component] && wideOk(el)) {
                    if (this.html && this.html.classList) this.html.classList.add('my-cat');
                    Lampa.Utils.extendItemsParams([el], { style: { name: 'wide' } }, true);
                }
            } catch (e) { warnOnce(12, 'не удалось сделать широкую карточку: ' + e.message); }
            return callOrig(orig, this, args);
        });
    }

    // ---------------------------------------------------------------------------------------
    // ПРАВКА 10: шрифт SF Pro — один раз скачивается с компьютера в домашней сети в хранилище Lampa на ТВ
    // (IndexedDB, та же база, что у int-addon.js: уже загруженный шрифт не нужно качать снова).
    // ---------------------------------------------------------------------------------------

    var FONT_FILES = [
        { file: 'SFPRODISPLAYREGULAR.OTF', weight: 400 },
        { file: 'SFPRODISPLAYMEDIUM.OTF', weight: 500 },
        { file: 'SFPRODISPLAYBOLD.OTF', weight: 700 }
    ];

    var Font = {
        ready: false,

        db: function (cb) {
            if (!window.indexedDB) { cb(null); return; }
            var req;
            try { req = window.indexedDB.open('my_int_addon', 1); } catch (e) { cb(null); return; }
            req.onupgradeneeded = function () {
                try { req.result.createObjectStore('fonts'); } catch (e) {}
            };
            req.onsuccess = function () { cb(req.result); };
            req.onerror = function () { cb(null); };
        },

        apply: function () {
            var self = this;
            this.db(function (db) {
                if (!db) return;
                var got = [], left = FONT_FILES.length;
                var tx;
                try { tx = db.transaction('fonts', 'readonly'); } catch (e) { return; }
                var store = tx.objectStore('fonts');
                for (var i = 0; i < FONT_FILES.length; i++) {
                    (function (f) {
                        var r = store.get(f.file);
                        r.onsuccess = function () {
                            if (r.result) got.push({ weight: f.weight, buf: r.result });
                            if (--left === 0) self.install(got);
                        };
                        r.onerror = function () { if (--left === 0) self.install(got); };
                    })(FONT_FILES[i]);
                }
            });
        },

        install: function (got) {
            if (!got.length) return;
            var css = [];
            for (var i = 0; i < got.length; i++) {
                var url = URL.createObjectURL(new Blob([got[i].buf], { type: 'font/otf' }));
                css.push('@font-face{font-family:"MySFPro";src:url(' + url + ') format("opentype");font-weight:' + got[i].weight + ';font-style:normal;font-display:swap}');
            }
            var st = document.getElementById('my-interface-font') || document.createElement('style');
            st.id = 'my-interface-font';
            st.textContent = css.join('\n');
            if (!st.parentNode) document.head.appendChild(st);
            this.ready = true;
            applyBodyClasses();
            info('шрифт SF Pro подключён из хранилища ТВ (' + got.length + ' начертания)');
        },

        // Если плагин загружен с компьютера в домашней сети — шрифт берём оттуда же (адрес вводить не нужно).
        guessBase: function () {
            var root = lanRoot();
            return root ? root + 'sf-pro-display/' : '';
        },

        download: function () {
            var base = String(opt('my_font_src', '') || '').trim() || this.guessBase();
            if (!base) { Lampa.Noty.show('Сначала укажите адрес папки со шрифтом'); return; }
            if (base.charAt(base.length - 1) !== '/') base += '/';
            var self = this;
            var bufs = [], left = FONT_FILES.length, failed = '';
            Lampa.Noty.show('Загружаю шрифт с компьютера…');
            var done = function () {
                if (failed) { Lampa.Noty.show('Шрифт не загрузился: ' + failed); warnOnce(10, 'шрифт не загрузился: ' + failed); return; }
                self.db(function (db) {
                    if (!db) { Lampa.Noty.show('Нет хранилища IndexedDB на этом устройстве'); return; }
                    var tx = db.transaction('fonts', 'readwrite');
                    var store = tx.objectStore('fonts');
                    for (var i = 0; i < bufs.length; i++) store.put(bufs[i].buf, bufs[i].file);
                    tx.oncomplete = function () {
                        Lampa.Storage.set('my_font', true);
                        Lampa.Noty.show('Шрифт сохранён на ТВ и включён');
                        self.apply();
                    };
                    tx.onerror = function () { Lampa.Noty.show('Не удалось сохранить шрифт'); };
                });
            };
            for (var i = 0; i < FONT_FILES.length; i++) {
                (function (f) {
                    var x = new XMLHttpRequest();
                    x.open('GET', base + f.file, true);
                    x.responseType = 'arraybuffer';
                    x.timeout = 20000;
                    x.onload = function () {
                        if (x.status >= 200 && x.status < 300 && x.response && x.response.byteLength > 1000) bufs.push({ file: f.file, buf: x.response });
                        else failed = f.file + ' (HTTP ' + x.status + ')';
                        if (--left === 0) done();
                    };
                    x.onerror = function () { failed = f.file + ' (нет связи с компьютером)'; if (--left === 0) done(); };
                    x.ontimeout = function () { failed = f.file + ' (таймаут)'; if (--left === 0) done(); };
                    x.send();
                })(FONT_FILES[i]);
            }
        }
    };


    // ---------------------------------------------------------------------------------------
    // ПРАВКА 13: шапка спрятана на главном и на странице фильма; видна, пока фокус в ней или в настройках
    // ---------------------------------------------------------------------------------------

    // «category» — «Фильмы», «Сериалы» и жанр из «Каталога»: Lampa собирает их так же, как главный экран.
    var HEAD_PAGES = { main: true, full: true, category: true };

    function setHeadPage(component) {
        if (document.body) document.body.classList.toggle('my-head-page', !!HEAD_PAGES[component]);
    }

    function followHead() {
        if (!Lampa.Controller || !Lampa.Controller.listener) {
            warnOnce(13, 'нет Lampa.Controller.listener — шапка не появится по «вверх», выключите «Прятать шапку»');
            return;
        }
        // Окно выбора значения (select), открытое из настроек, — тоже «в настройках»: шапка не пропадает.
        var inSettings = false;
        follow(Lampa.Controller.listener, 'toggle', function (e) {
            var n = String((e && e.name) || '');
            var on;
            if (n === 'head') { on = true; inSettings = false; }
            else if (n.indexOf('settings') === 0) { on = true; inSettings = true; }
            else if (n === 'select' && inSettings) on = true;
            else { on = false; inSettings = false; }
            document.body.classList.toggle('my-head-on', on);
        });
    }

    // ---------------------------------------------------------------------------------------
    // Настройки «Мой интерфейс» (те же ключи my_…, что у int-addon.js)
    // ---------------------------------------------------------------------------------------

    var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.8l2.3 5.6 5.9.5-4.5 3.9 1.4 5.8L12 15.5l-5.1 3.1 1.4-5.8-4.5-3.9 5.9-.5z"/></svg>';

    function addSettings() {
        var C = 'my_int_addon';
        var S = Lampa.SettingsApi;
        if (!S) return;
        S.addComponent({ component: C, name: 'Мой интерфейс', icon: ICON });
        var title = function (name, text) { S.addParam({ component: C, param: { name: name, type: 'title' }, field: { name: text } }); };
        var trigger = function (name, def, text, descr, onChange) {
            S.addParam({ component: C, param: { name: name, type: 'trigger', default: def }, field: { name: text, description: descr }, onChange: onChange || function () { applyBodyClasses(); } });
        };
        var button = function (name, text, descr, fn) {
            S.addParam({ component: C, param: { name: name, type: 'static' }, field: { name: text, description: descr },
                onRender: function (item) { item.on('hover:enter', fn); } });
        };
        title('my_t_main', 'my-interface ' + VERSION);
        trigger('my_addon', true, 'Интерфейс включён', 'Выключите, если что-то пошло не так: Lampa перезагрузится с обычным интерфейсом.', function () {
            setTimeout(function () { window.location.reload(); }, 300);
        });

        title('my_t_trailer', 'Трейлер');
        trigger('my_trailer_full', true, 'Трейлер на странице фильма', 'Играет по кругу на фоне вверху страницы, пока выбраны кнопки. Начинает загружаться сразу при открытии фильма. На главном экране трейлеров нет.');
        trigger('my_trailer_sound', true, 'Звук трейлера', 'Включён — трейлер играет со звуком. Звук переключает и кнопка с динамиком на странице фильма.', function () { updateSoundIcons(); });

        title('my_t_look', 'Оформление');
        trigger('my_dark', true, 'Тёмная тема', 'Чёрный фон вместо размытого кадра фильма, тёмные меню, настройки и окна выбора — как на образце Netflix.');
        trigger('my_glass', true, 'Стеклянный фокус карточек', 'Выбранная карточка увеличивается, белая рамка по краю, блик сверху.');
        trigger('my_motion', true, 'Плавная смена баннера', 'Информация о фильме приезжает в сторону нажатия, старая плавно уходит.');
        trigger('my_hide_play', true, 'Скрыть значок «уже смотрел»', 'Значок проигрывания на карточках, которые вы начинали смотреть.');
        trigger('my_type_label', true, 'Метка «Фильм» / «Сериал»', 'В правом верхнем углу карточки вместо красной метки «TV».');
        trigger('my_status', true, 'Цветной статус', 'Вышел / Завершён — зелёный, В процессе — синий, Снимается — оранжевый, Не вышел / Закрыт — красный. Выключено — тёмная «таблетка» с белой рамкой.');
        trigger('my_banner_bright', true, 'Яркий баннер', 'Кадр фильма во всю яркость; слева под текстом и снизу под рядом — затемнение.');
        S.addParam({
            component: C,
            param: { name: 'my_bg_size', type: 'select', values: { w780: 'w780 — быстрее', w1280: 'w1280 — рекомендуется', original: 'original — до 4K, медленнее' }, default: 'w1280' },
            field: { name: 'Размер кадра фона', description: 'Чем больше, тем дольше грузится и больше памяти. На экране 1080p разницы между w1280 и original почти не видно.' }
        });
        trigger('my_hide_head', true, 'Прятать шапку', 'На главном экране, в «Фильмах», «Сериалах», жанрах из «Каталога» и на странице фильма шапки (поиск, настройки, часы, дата) не видно; «вверх» с верхнего ряда или кнопок — она появляется, «вниз» — прячется. На «Еще», «Истории», «Избранном» и в настройках шапка видна.');
        trigger('my_card_caps', true, 'Карточки как на образце', 'Три крупные карточки на экран с нахлёстом выбранной, без оценки на карточке.');
        trigger('my_cat_wide', true, '«Еще», «История», «Избранное» по образцу', '«Еще» в конце ряда, «История» и папки «Избранного» — широкие кадры по три в ряд, под каждым название, жанры и год. «Избранное» — три плитки по центру: «Нравится», «Позже», «Закладки» с количеством. Действует на страницы, открытые после переключения.');
        trigger('my_card_logos', true, 'Логотипы на карточках', 'Название фильма логотипом на кадре; запрос к TMDB только для карточек на экране, ответы запоминаются.');

        title('my_t_full', 'Страница фильма');
        trigger('my_hero', true, 'Новая страница фильма', 'Фон на весь экран, логотип, рейтинги, кнопки «Смотреть», «Избранное» и звук; ниже у сериала «Эпизоды», затем «Похожие» и «Актёры». Без «Рекомендаций», «Подробно» и «Комментариев». Действует при следующем открытии фильма.');
        trigger('my_watch_torrents', true, '«Смотреть» сразу открывает торренты', 'Если торренты недоступны, откроется обычное меню источников.');

        title('my_t_rates', 'Рейтинги');
        trigger('my_rate_imdb', true, 'IMDb', 'Internet Movie Database (принадлежит Amazon) — крупнейшая в мире база фильмов. Средняя оценка зрителей по 10-балльной шкале. Берётся из MDBList, а без его ключа — из Кинопоиска.');
        trigger('my_rate_tmdb', true, 'TMDB', 'The Movie Database — открытая база фильмов, из которой Lampa берёт описания и постеры. Оценка её пользователей по 10-балльной шкале. Уже есть в данных Lampa, запросов нет.');
        trigger('my_rate_kp', true, 'Кинопоиск', 'Кинопоиск (Яндекс) — самая популярная русскоязычная база фильмов. Оценка зрителей по 10-балльной шкале. Источник — неофициальный API kinopoiskapiunofficial.tech, нужен ваш бесплатный ключ (ниже).');
        trigger('my_rate_tomatoes', true, 'Rotten Tomatoes — критики 🍅', 'Rotten Tomatoes — американский сайт-агрегатор рецензий. «Томатометр»: процент положительных рецензий профессиональных критиков. Источник — MDBList, нужен ключ (ниже).');
        trigger('my_rate_popcorn', true, 'Rotten Tomatoes — зрители 🍿', 'Оценка зрителей Rotten Tomatoes («Попкорнметр»): процент зрителей, поставивших 3,5 звезды и выше. Источник — MDBList, нужен ключ (ниже).');
        trigger('my_rate_cub', true, 'CUB — пользователи Lampa', 'CUB — облачный сервис Lampa. Процент положительных реакций (огонь и палец вверх) среди всех реакций пользователей Lampa. Считается из реакций, которые Lampa уже загрузила, — запросов нет.');
        S.addParam({
            component: C,
            param: { name: 'my_mdb_key', type: 'input', values: '', placeholder: 'ключ MDBList', default: '' },
            field: { name: 'Ключ MDBList', description: 'Для IMDb и Rotten Tomatoes. Бесплатно: mdblist.com → войти → Preferences → API. Около 1000 запросов в сутки. Рейтинги показываются на странице фильма; запрос — только когда фильм открыт, ответ хранится неделю.' }
        });
        S.addParam({
            component: C,
            param: { name: 'my_kp_key', type: 'input', values: '', placeholder: 'ключ kinopoiskapiunofficial.tech', default: '' },
            field: { name: 'Ключ Кинопоиска', description: 'Бесплатно: kinopoiskapiunofficial.tech → регистрация → Профиль. Около 500 запросов в сутки. Рейтинги показываются на странице фильма; запрос — только когда фильм открыт, ответ хранится неделю.' },
            onRender: function () { setTimeout(maskKeyFields, 0); }
        });
        button('my_load_keys', 'Загрузить ключи с компьютера', 'Берёт ключи из файла keys.local.json в папке плагина на компьютере (запущен scripts/serve-local.py) — чтобы не набирать их пультом. Пустые поля файла не меняют уже введённые ключи.', function () { importKeys(); });
        button('my_check_keys', 'Проверить ключи', 'Пробный запрос к MDBList и Кинопоиску: покажет, принят ли ключ, и что ответил сервис. Заодно очищает кэш рейтингов.', function () { checkKeys(); });

        title('my_t_font', 'Шрифт');
        trigger('my_font', false, 'Шрифт SF Pro', 'Работает после загрузки шрифта с компьютера (кнопка ниже). Шрифт хранится только на этом ТВ.');
        S.addParam({
            component: C,
            param: { name: 'my_font_src', type: 'input', values: '', placeholder: 'http://192.168.x.x:8080/sf-pro-display/', default: '' },
            field: { name: 'Адрес папки со шрифтом', description: 'Можно не заполнять, если плагин загружен с компьютера в домашней сети: адрес возьмётся оттуда же. Иначе — адрес компьютера с запущенным scripts/serve-local.py и папка sf-pro-display/.' }
        });
        button('my_font_load', 'Загрузить шрифт с компьютера', 'Один раз: скачивает шрифт по адресу выше и сохраняет на ТВ.', function () { Font.download(); });
    }

    // ---------------------------------------------------------------------------------------
    // Запуск
    // ---------------------------------------------------------------------------------------

    function follow(obj, name, fn) {
        try { if (obj && obj.follow) obj.follow(name, fn); } catch (e) {}
    }

    function onReady() {
        if (onReady.done) return;
        onReady.done = true;
        var found = conflicts();
        if (found.length) {
            halted = true;
            try { Lampa.Noty.show('my-interface не запущен: выключите в «Расширениях» ' + found.join(', '), { time: 12000 }); } catch (e) {}
            warnOnce('—', 'конфликт: ' + found.join(', '));
            return;
        }
        try { addSettings(); } catch (e) { warnOnce('—', 'не удалось добавить настройки: ' + e.message); }
        if (opt('my_addon', true) === false) {
            halted = true;
            info('выключен в настройках — ничего не меняю');
            return;
        }
        injectCss();
        applyBodyClasses();
        document.addEventListener('hover:focus', onFocusCapture, true);
        document.addEventListener('hover:enter', onEnterCapture, true);                       // ПРАВКА 6
        window.addEventListener('message', function (e) { Trailer.onMessage(e.data); });      // ПРАВКА 1
        document.addEventListener('visibilitychange', function () { if (document.hidden) stopTrailersNow(); });
        follow(Lampa.Storage.listener, 'change', function (e) {
            if (!e || typeof e.name !== 'string' || e.name.indexOf('my_') !== 0) return;
            applyBodyClasses();
            if (e.name === 'my_card_logos') refreshCardLogos();
            if (e.name === 'my_mdb_key' || e.name === 'my_kp_key') {
                setTimeout(maskKeyFields, 50);
                setTimeout(maskKeyFields, 400);
            }
        });
        follow(Lampa.Listener, 'activity', function (e) {
            if (!e) return;
            if (e.type === 'start') {
                setHeadPage(e.component);                                                      // ПРАВКА 13
                setTimeout(decoratePending, 600);
            }
            if (e.type === 'start' || e.type === 'archive' || e.type === 'destroy') {
                Trailer.stop(e.type === 'destroy');
                clearTimeout(Full.timer);
                pruneObservers();
                if (e.type === 'destroy' && Full.root && !inDoc(Full.root)) { Full.root = null; Full.data = null; }
            }
        });
        follow(Lampa.Listener, 'full', function (e) {                                          // ПРАВКИ 6, 7
            try {
                if (e.type === 'start') onFullStart(e);
                else if (e.type === 'build') onFullBuild(e);
                else if (e.type === 'complite') onFullComplite(e);
            } catch (err) { warnOnce(6, 'ошибка на странице фильма: ' + err.message); }
        });
        try { follow(Lampa.Player.listener, 'start', stopTrailersNow); } catch (e) {}
        try { follow(Lampa.Screensaver.listener, 'start', stopTrailersNow); } catch (e) {}
        followHead();
        try { var act = Lampa.Activity.active(); setHeadPage(act && act.component); } catch (e) {}
        Font.apply();                                                                          // ПРАВКА 10
        info('запущен ' + VERSION);
    }

    function boot() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Storage || !Lampa.Maker) {
            boot.tries = (boot.tries || 0) + 1;
            if (boot.tries < 150) setTimeout(boot, 200);
            else warnOnce('—', 'Lampa не найдена — плагин не запущен');
            return;
        }
        // Конфликт проверяем до встраивания: при включённом оригинале или аддоне главный экран не трогаем.
        if (conflicts().length) {
            if (window.appready) onReady();
            else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') onReady(); });
            return;
        }
        if (opt('my_addon', true) !== false) {
            // Встраиваемся сразу, до создания главного экрана.
            patchHome();
            patchCardVisible();
            patchCategory();        // ПРАВКА 12
        }
        if (window.appready) onReady();
        else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') onReady(); });
    }

    boot();
})();
