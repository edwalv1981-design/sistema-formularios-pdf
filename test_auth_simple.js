async function test() {
    console.log("Intentando Login MASTER...");
    try {
        const resMaster = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identificacion: 'admin', password: 'admin123' })
        });
        const data = await resMaster.json();
        console.log("Status:", resMaster.status);
        console.log("Data:", data);
    } catch (e) {
        console.error("Error connecting:", e.message);
    }
}
test();
