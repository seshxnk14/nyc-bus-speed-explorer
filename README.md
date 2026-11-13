# NYC Bus Speed Explorer

Where along a New York City bus route do buses run slowly, and how does that vary by hour and month? This interactive D3 prototype uses Brooklyn's **B4 Local** route as a case study, with 2025 MTA segment speed data. The current version covers B4; it does not yet support selecting other routes.

## Run locally

1. Install Node.js with npm, if you don't already have it.
2. Clone this repository or download and extract it using **Code → Download ZIP**.
3. Open a terminal in the folder containing `package.json` and run:

   ```sh
   npm install
   npm start
   ```

4. Open [http://localhost:8080](http://localhost:8080).

The first install needs internet access to download D3.js 7.9.0. The install step copies D3 into the project so subsequent local runs can work offline. The prepared dataset is included; no API key or Python setup is needed. Use **Ctrl+C** to stop the server. If port 8080 is busy, run `npm start -- --port 8081` and open [http://localhost:8081](http://localhost:8081).


