if (content.startsWith("PTRE_ACTIVITY|")) {

    const lines = content.split("\n");
    const activities = [];

    for (const line of lines) {

        if (!line.startsWith("PTRE_ACTIVITY|")) continue;

        const parts = line.split("|");

        if (parts.length < 7) continue;

        const player = parts[1];
        const coord = parts[2];
        const type = parts[3];
        const minutes = parseInt(parts[4]);

        const planetID = parseInt(parts[5]);
        const moonID = parseInt(parts[6]);

        const coordParts = coord.split(":");

        const galaxy = parseInt(coordParts[0]);
        const system = parseInt(coordParts[1]);
        const position = parseInt(coordParts[2]);

        const activity = {
            galaxy: galaxy,
            system: system,
            position: position,
            player: player,
            type: type,
            activity: minutes,
            coord: coord
        };

        if (type == "planet") {
            activity.id_planet = planetID;
            activity.id_moon = moonID;
        }

        if (type == "moon") {
            activity.id_planet = planetID;
            activity.id_moon = moonID;
        }

        activities.push(activity);
    }

    console.log("========================");
    console.log("ATIVIDADES PTRE:");
    console.log(activities);
    console.log("========================");

    try {

        const response = await axios.post(
            PTRE_URL,
            {
                team_key: TEAM_KEY,
                activities: activities
            }
        );

        console.log("========================");
        console.log("RESPOSTA PTRE:");
        console.log(response.data);
        console.log("========================");

    } catch (err) {

        console.log("========================");
        console.log("ERRO PTRE:");
        console.log(err.response?.data || err.message);
        console.log("========================");
    }
}
