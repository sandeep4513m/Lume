fetch("http://127.0.0.1:1420/").then(r => r.text()).then(t => process.exit(0)).catch(e => { console.error("Server down", e); process.exit(1); })
