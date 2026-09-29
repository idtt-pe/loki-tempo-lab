# Resultados de loki-tempo-lab

## Carga y costo por request

| Modo | Requests | Líneas de log | Spans | Recibido Loki | Recibido Tempo | Disco Loki (chunks + índice) | Disco Tempo (bloques) | Streams de Loki | Líneas descartadas |
|---|---|---|---|---|---|---|---|---|---|
| 100 % de trazas | 158,384 | 258,291 | 885,084 | 76.4 MB | 338.3 MB | 15.3 MB | 129.8 MB | 9 | 0 |
| Head 10 % | 158,336 | 257,993 | 88,353 | 76.4 MB | 33.9 MB | 15.3 MB | 20.6 MB | 11 | 0 |
| Tail (errores + lentos + 10 %) | 158,251 | 258,073 | 102,876 | 76.4 MB | 54.2 MB | 15.3 MB | 21.3 MB | 11 | 0 |
| trace_id como label | 158,379 | 66,429 | 884,911 | 16.3 MB | 338.3 MB | 23.8 MB | 181.7 MB | 5,000 | 19,384 |

## Por request

| Modo | Bytes a Loki | Bytes a Tempo | Disco Loki | Disco Tempo |
|---|---|---|---|---|
| 100 % de trazas | 506.0 | 2240.0 | 101.1 | 859.4 |
| Head 10 % | 505.8 | 224.3 | 101.0 | 136.7 |
| Tail (errores + lentos + 10 %) | 506.0 | 359.2 | 101.3 | 141.4 |
| trace_id como label | 107.7 | 2239.6 | 157.8 | 1202.8 |

## ¿Está la traza en Tempo? (muestra de hasta 300 requests por caso, tomadas de los logs de Loki)

| Modo | Errores | Lentos | Normales | Cliente 777 |
|---|---|---|---|---|
| 100 % de trazas | 300/300 (100 %) | 300/300 (100 %) | 300/300 (100 %) | 300/300 (100 %) |
| Head 10 % | 29/300 (10 %) | 27/300 (9 %) | 31/300 (10 %) | 26/300 (9 %) |
| Tail (errores + lentos + 10 %) | 300/300 (100 %) | 300/300 (100 %) | 31/300 (10 %) | 40/300 (13 %) |
| trace_id como label | — | — | 300/300 (100 %) | 53/53 (100 %) |

## Consultas (mediana de 3 ejecuciones, ventana completa de la corrida)

| Modo | Backend | Consulta | ms | Resultados | Bytes leídos |
|---|---|---|---|---|---|
| 100 % de trazas | Loki | `{service_name="command-api", level="error"}` | 5.8 | 20 | 0.1 MB |
| 100 % de trazas | Loki | `{service_name="command-api"} | json | route="/payments" | duration_ms > 1000` | 111.4 | 20 | 10.1 MB |
| 100 % de trazas | Loki | `{service_name=~"command-api|query-api"} | json | wallet_id="777"` | 406.5 | 1000 | 76.0 MB |
| 100 % de trazas | Loki | `{service_name=~"command-api|query-api"} |= `"wallet_id":777,`` | 227.2 | 1000 | 76.0 MB |
| 100 % de trazas | Loki | `{service_name=~".+"} | trace_id="86f1141ed1fdb5e385030da4d4bd2d00"` | 170.5 | 2 | 85.1 MB |
| 100 % de trazas | Tempo | `{ status = error }` | 31.1 | 20 | 3.3 MB |
| 100 % de trazas | Tempo | `{ name = "POST /payments" && duration > 1s }` | 24.5 | 20 | 3.0 MB |
| 100 % de trazas | Tempo | `{ name = "antifraud.check" && duration > 1s }` | 17.1 | 20 | 3.1 MB |
| 100 % de trazas | Tempo | `{ span.wallet.id = 777 }` | 334.7 | 741 | 38.4 MB |
| Head 10 % | Loki | `{service_name="command-api", level="error"}` | 4.5 | 20 | 0.1 MB |
| Head 10 % | Loki | `{service_name="command-api"} | json | route="/payments" | duration_ms > 1000` | 80.6 | 20 | 10.2 MB |
| Head 10 % | Loki | `{service_name=~"command-api|query-api"} | json | wallet_id="777"` | 527.3 | 963 | 75.4 MB |
| Head 10 % | Loki | `{service_name=~"command-api|query-api"} |= `"wallet_id":777,`` | 418.9 | 963 | 75.4 MB |
| Head 10 % | Loki | `{service_name=~".+"} | trace_id="461dd3423cd9788f3b99ee82ed089bd4"` | 341.8 | 2 | 84.0 MB |
| Head 10 % | Tempo | `{ status = error }` | 28.2 | 20 | 1.2 MB |
| Head 10 % | Tempo | `{ name = "POST /payments" && duration > 1s }` | 23.2 | 20 | 1.2 MB |
| Head 10 % | Tempo | `{ name = "antifraud.check" && duration > 1s }` | 22.2 | 20 | 1.2 MB |
| Head 10 % | Tempo | `{ span.wallet.id = 777 }` | 55.6 | 66 | 5.3 MB |
| Tail (errores + lentos + 10 %) | Loki | `{service_name="command-api", level="error"}` | 6.2 | 20 | 0.1 MB |
| Tail (errores + lentos + 10 %) | Loki | `{service_name="command-api"} | json | route="/payments" | duration_ms > 1000` | 103.0 | 20 | 9.7 MB |
| Tail (errores + lentos + 10 %) | Loki | `{service_name=~"command-api|query-api"} | json | wallet_id="777"` | 428.6 | 1023 | 75.7 MB |
| Tail (errores + lentos + 10 %) | Loki | `{service_name=~"command-api|query-api"} |= `"wallet_id":777,`` | 218.9 | 1023 | 75.7 MB |
| Tail (errores + lentos + 10 %) | Loki | `{service_name=~".+"} | trace_id="9d2cc54716dd76c66d5da7cdca9a0362"` | 173.0 | 2 | 85.0 MB |
| Tail (errores + lentos + 10 %) | Tempo | `{ status = error }` | 11.3 | 20 | 0.2 MB |
| Tail (errores + lentos + 10 %) | Tempo | `{ name = "POST /payments" && duration > 1s }` | 9.5 | 20 | 0.5 MB |
| Tail (errores + lentos + 10 %) | Tempo | `{ name = "antifraud.check" && duration > 1s }` | 8.3 | 20 | 0.5 MB |
| Tail (errores + lentos + 10 %) | Tempo | `{ span.wallet.id = 777 }` | 46.9 | 92 | 4.6 MB |
| trace_id como label | Loki | `{service_name="command-api", level="error"}` | 2.5 | 0 | 0.0 MB |
| trace_id como label | Loki | `{service_name="command-api"} | json | route="/payments" | duration_ms > 1000` | 35.0 | 0 | 1.3 MB |
| trace_id como label | Loki | `{service_name=~"command-api|query-api"} | json | wallet_id="777"` | 57.1 | 36 | 2.3 MB |
| trace_id como label | Loki | `{service_name=~"command-api|query-api"} |= `"wallet_id":777,`` | 50.0 | 36 | 2.3 MB |
| trace_id como label | Loki | `{trace_id="a3e1f119853a7a2740e612ccab78a8dd"}` | 2.0 | 2 | 0.0 MB |
| trace_id como label | Tempo | `{ status = error }` | 29.5 | 20 | 1.6 MB |
| trace_id como label | Tempo | `{ name = "POST /payments" && duration > 1s }` | 28.2 | 20 | 4.7 MB |
| trace_id como label | Tempo | `{ name = "antifraud.check" && duration > 1s }` | 17.1 | 20 | 3.1 MB |
| trace_id como label | Tempo | `{ span.wallet.id = 777 }` | 373.9 | 739 | 37.1 MB |

## Recursos durante la carga (docker stats cada 5 s)

| Modo | Loki CPU prom. | Loki RAM máx. | Tempo CPU prom. | Tempo RAM máx. | Alloy CPU prom. | Alloy RAM máx. |
|---|---|---|---|---|---|---|
| 100 % de trazas | 0.6 % | 138.3 MiB | 9.0 % | 708.0 MiB | 3.6 % | 71.5 MiB |
| Head 10 % | 0.6 % | 142.0 MiB | 0.7 % | 265.5 MiB | 2.8 % | 84.7 MiB |
| Tail (errores + lentos + 10 %) | 0.7 % | 148.5 MiB | 1.5 % | 246.3 MiB | 3.9 % | 127.5 MiB |
| trace_id como label | 0.6 % | 200.8 MiB | 8.2 % | 867.9 MiB | 2.3 % | 118.6 MiB |

## Latencia de la API durante la corrida (k6, ms)

| Modo | Pago p50 | Pago p99 | Pagos fallidos | Estado de cuenta p99 |
|---|---|---|---|---|
| 100 % de trazas | 4.9 | 1203.0 | 0.97 % | 20.1 |
| Head 10 % | 4.8 | 1203.1 | 1.05 % | 15.0 |
| Tail (errores + lentos + 10 %) | 4.9 | 1203.4 | 1.07 % | 15.9 |
| trace_id como label | 5.0 | 1203.5 | 1.08 % | 74.4 |
