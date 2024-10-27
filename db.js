import { createPool } from "mysql2/promise";
import env from "dotenv";

env.config({path:'./env/.env'})

// console.log(process.env.DB_HOST, process.env.DB_USER, process.env.DB_PASS, process.env.DB_DATABASE);


export const pool = createPool({

    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
     
});
    
if(pool){
    console.log('DB Connected');
}
