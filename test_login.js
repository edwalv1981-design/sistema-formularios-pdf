async function test() {
    console.log("Registrando empresa...");
    const resReg = await fetch('http://localhost:3000/api/usuarios/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nombres_completos: 'Empresa Test',
            identificacion: 'TEST1234',
            direccion: 'Quito',
            telefono: '0999999',
            tipo_formulario: 'PTLKYVI',
            password: 'mypassword',
            es_adicional: false
        })
    });
    
    // Validamos registro
    if (!resReg.ok) {
        console.log("Error al registrar", await resReg.json());
        return;
    }
    console.log("Registrado con éxito");

    // Login master
    const resMaster = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: 'admin', password: 'admin' })
    });
    const masterData = await resMaster.json();
    const token = masterData.token;

    // Obtener id de la db
    const resUsers = await fetch('http://localhost:3000/api/usuarios', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    const users = await resUsers.json();
    const myUser = users.find(u => u.identificacion === 'TEST1234');
    
    console.log("Aprobando usuario ID:", myUser.id);
    await fetch(`http://localhost:3000/api/usuarios/${myUser.id}/aprobar`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token }
    });

    console.log("Intentando Login como la empresa...");
    const resLogin = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: 'TEST1234', password: 'mypassword' })
    });
    
    console.log(await resLogin.json());
}

test();
