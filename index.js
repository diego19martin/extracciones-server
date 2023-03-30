import express from "express";
import cors from "cors";
import extraccionesRoutes from "./routes/extracciones.routes.js"

const app = express();

const corsOption = {
    credentials: true,
    origin: ['https://extracciones-client-conversion.vercel.app']
}

res.setHeader("Access-Control-Allow-Origin", 'https://extracciones-client-conversion.vercel.app');
res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS,PUT,DELETE');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');

app.use(cors(corsOption));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
});


app.use(express.json());
app.use(extraccionesRoutes);