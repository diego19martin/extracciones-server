import { createPool } from "mysql2/promise";
import env from "dotenv";

env.config({path:'./env/.env'})

export const pool = new createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE
});

if(pool){
    console.log('DB Connected');
}
