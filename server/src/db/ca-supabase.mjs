/* =============================================================================
 *  GHT4 · âncora de confiança do Supabase
 * -----------------------------------------------------------------------------
 *  O Supabase assina o certificado do banco com uma autoridade própria:
 *
 *      *.pooler.supabase.com
 *        ← Supabase Intermediate 2021 CA
 *          ← Supabase Root 2021 CA   (autoassinada)
 *
 *  Essa raiz não está no bundle de CAs do Node. O servidor manda a cadeia
 *  inteira, e o Node, sem ter em quem ancorá-la, recusa a conexão com
 *  SELF_SIGNED_CERT_IN_CHAIN — o pool nem chega a mandar a senha.
 *
 *  POR QUE ISTO E NÃO `PGSSL_INSEGURO=1`
 *  Desligar a verificação faria a conexão subir, e é o conselho que mais circula
 *  na internet. Também faria o agente aceitar QUALQUER servidor que se diga o
 *  banco — e o que trafega aqui é hash de senha, sessão e carteira de clientes.
 *  Fixar a raiz mantém a verificação de pé: continua exigindo que o outro lado
 *  prove ser quem diz, só que contra esta autoridade.
 *
 *  ISTO NÃO É SEGREDO
 *  É a chave PÚBLICA de uma autoridade certificadora, publicada pelo Supabase em
 *  prod-ca-2021.crt. Versionar é o comportamento correto — é justamente o que
 *  permite conferir que ninguém a trocou.
 *
 *  PROCEDÊNCIA
 *    assunto:  C=US ST=Delware L=New Castle O=Supabase Inc
 *              CN=Supabase Root 2021 CA
 *    validade: 28/04/2021 → 26/04/2031
 *    sha256:   80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:
 *              82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
 *
 *  Conferido de duas origens independentes que bateram byte a byte: a cadeia
 *  apresentada no handshake com aws-1-sa-east-1.pooler.supabase.com e o arquivo
 *  publicado pelo Supabase. Para reconferir, compare o sha256 acima com:
 *    openssl x509 -in prod-ca-2021.crt -noout -fingerprint -sha256
 *
 *  EM 2031 ISTO EXPIRA. A conexão passa a falhar na validação — não em silêncio.
 *  Substituir pela raiz nova publicada pelo Supabase, repetindo a conferência.
 * ========================================================================== */

export const CA_SUPABASE = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;
