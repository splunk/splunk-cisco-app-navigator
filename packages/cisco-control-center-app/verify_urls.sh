#!/bin/bash
urls=(
  "https://www.cisco.com/site/us/en/products/security/duo/index.html"
  "https://isovalent.com"
  "https://www.cisco.com/site/us/en/products/security/secure-client/index.html"
  "https://www.cisco.com/site/us/en/products/security/endpoint-security/secure-endpoint/index.html"
  "https://www.cisco.com/c/en/us/products/security/threat-grid/index.html"
  "https://www.cisco.com/c/en/us/products/security/stealthwatch/index.html"
  "https://www.cisco.com/site/us/en/products/security/secure-workload/index.html"
  "https://www.radware.com"
  "https://appomni.com"
  "https://www.cisco.com/c/en/us/products/security/email-security/index.html"
  "https://www.cisco.com/site/us/en/products/networking/software/internet-cloud-intelligence/index.html"
  "https://www.cisco.com/site/us/en/products/full-stack-observability/appdynamics/index.html"
)
for url in "${urls[@]}"; do
  code=$(curl -o /dev/null -s -w "%{http_code}" -L --max-time 15 "$url")
  echo "$code $url"
done
