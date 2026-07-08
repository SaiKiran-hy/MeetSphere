import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

dotenv.config();

const app = express();
const server = createServer(app);

connectToSocket(server);

app.use(cors());

app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({
    limit: "40kb",
    extended: true
}));

app.use("/api/v1/users", userRoutes);

const PORT = process.env.PORT || 8080;

const start = async () => {
    try {

        const connectionDb = await mongoose.connect(process.env.MONGO_URI);

        console.log(
            `MongoDB Connected: ${connectionDb.connection.host}`
        );

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (err) {

        console.error("Database Connection Failed");
        console.error(err.message);

        process.exit(1);
    }
};

start();