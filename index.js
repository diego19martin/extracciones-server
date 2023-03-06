import express from "express";
import cors from "cors";
import extraccionesRoutes from "./routes/extracciones.routes.js"

const app = express();

app.use((req,res,next)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE');
    res.setHeader('Access-Control-Allow-Methods','Content-Type','Authorization');
    next(); 
})

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
});


app.use(express.json());
app.use(extraccionesRoutes);