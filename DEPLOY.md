# House Tasks – asennus palvelimelle (Plesk + Node.js)

House Tasks on yksi Node.js-sovellus: Express-palvelin (`server/`) tarjoaa sekä rajapinnan (`/api`) että valmiiksi rakennetun React-käyttöliittymän (`dist/`). Tietokanta on SQLite-tiedosto `server/house-tasks.db`, joka syntyy automaattisesti ensimmäisellä käynnistyksellä.

## Vaatimukset

- Node.js 20.12 tai uudempi (Pleskin Node.js-laajennus)
- Domain tai alidomain, jolle sovellus asennetaan
- SSL-varmenne (Let's Encrypt Pleskistä)

## 1. Koodi palvelimelle

Hae repo Pleskin Git-toiminnolla tai SSH:lla domainin kansioon. Aja sen jälkeen repon juuressa:

```
npm ci
npm run build
cd server
npm ci
```

`npm run build` luo `dist`-kansion, jonka palvelin jakaa selaimille.

## 2. Node.js-sovelluksen asetukset Pleskissä

| Asetus | Arvo |
| --- | --- |
| Application Root | repon juurikansio |
| Document Root | repon `dist`-kansio |
| Application Startup File | `server/index.js` |
| Application Mode | production |

## 3. Ympäristömuuttujat

Aseta nämä Pleskin Node.js-asetuksissa, tai kopioi `server/.env.example` tiedostoksi `server/.env` ja täytä se. `.env`-tiedostoa ei koskaan lisätä Gitiin.

| Muuttuja | Mihin | Esimerkki |
| --- | --- | --- |
| `JWT_SECRET` | Kirjautumistunnusten allekirjoitus. Pitkä satunnainen merkkijono. | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `HOUSE_CODE` | Koodi, jolla uudet asukkaat luovat tunnuksen. Vähintään 12 merkkiä. | |
| `ADMIN_PASSWORD` | Ylläpitosivun (`/admin`) salasana. Tyhjänä ylläpitosivu on pois päältä. | |
| `PUBLIC_URL` | Sovelluksen julkinen osoite. Näkyy ylläpitosivulla QR-koodina. | `https://tasks.example.com` |

`PORT`-muuttujaa ei tarvitse asettaa, Plesk hoitaa sen.

Arvot toimitetaan asentajalle erikseen, ei Gitin eikä tämän tiedoston kautta.

## 4. HTTPS

Ota domainille Let's Encrypt -varmenne ja ohjaa HTTP-liikenne HTTPS:ään. Sovellus käyttää kirjautumistunnuksia, joten salaamatonta yhteyttä ei pidä sallia.

## 5. Käynnistys ja testaus

Käynnistä sovellus uudelleen (Restart App) ja tarkista:

- `https://<osoite>/` näyttää kirjautumissivun
- `https://<osoite>/admin` kysyy ylläpidon salasanaa

Käynnistyksen yhteydessä lokiin tulee varoitus, jos `ADMIN_PASSWORD` puuttuu tai `HOUSE_CODE` on alle 12 merkkiä.

## Päivitys

```
git pull
npm ci
npm run build
cd server
npm ci
```

Käynnistä sovellus sen jälkeen uudelleen. Tietokanta säilyy päivityksissä. Tehtävälista päivittyy tiedostosta `server/taskList.js` automaattisesti käynnistyksen yhteydessä.

## Automaattinen päivitys GitHubista (suositeltu)

Pleskin Git-toiminto voi hakea muutokset automaattisesti aina, kun `main`-branchiin pushataan. Silloin kehittäjä ei tarvitse pääsyä palvelimelle.

1. Lisää repo Pleskin Git-näkymään ja valitse automaattinen käyttöönotto (deployment) `main`-branchista.
2. Lisää GitHubin repoon Pleskin antama webhook-osoite (repo → Settings → Webhooks), jotta päivitys käynnistyy pushista.
3. Lisää Pleskin "Additional deployment actions" -kohtaan:

```
npm ci
npm run build
cd server && npm ci && cd ..
mkdir -p tmp && touch tmp/restart.txt
```

Viimeinen rivi käynnistää Node.js-sovelluksen uudelleen. Jos `npm` ei löydy, käytä Pleskin Node.js-version täyttä polkua.

Kaikki, mikä yhdistetään `main`-branchiin, menee siis suoraan käyttöön. Uudet ominaisuudet testataan omissa brancheissaan ennen yhdistämistä.

## Varmuuskopiot

Kaikki tieto on tiedostossa `server/house-tasks.db`. Varmista, että se kuuluu Pleskin varmuuskopioihin.

## Tietoturva lyhyesti

- Salasanat tallennetaan bcrypt-tiivisteinä, vähimmäispituus 8 merkkiä.
- Kirjautumista, rekisteröitymistä ja ylläpidon kirjautumista rajoitetaan: 10 väärää yritystä 15 minuutissa samasta osoitteesta estää uudet yritykset.
- Ylläpitosivun toiminnot vaativat ylläpidon salasanalla saadun tunnuksen, joka on voimassa 2 tuntia.
- Tavallisen käyttäjän tunnus on voimassa 8 tuntia.
