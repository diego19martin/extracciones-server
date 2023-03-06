import express from "express";
import cors from "cors";
import extraccionesRoutes from "./routes/extracciones.routes.js"

const app = express();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
});

app.use(cors());
app.use(express.json());
app.use(extraccionesRoutes);