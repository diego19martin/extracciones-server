import express from "express";
import cors from "cors";
import extraccionesRoutes from "./routes/extracciones.routes.js"

const app = express();

app.use(cors());

// Aumentar el límite de tamaño de carga a 10 MB
app.use(bodyParser.json({ limit: '10mb' }));


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
});


app.use(express.json());
app.use(extraccionesRoutes);