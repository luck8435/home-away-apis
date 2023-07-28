import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import imageDownloader from "image-downloader";
import path from "path";
// import fs from "fs";
import { fileURLToPath } from "url";
import Multer from "multer";
import { v2 as cloudinary } from "cloudinary";

import User from "./models/User.js";
import Place from "./models/Place.js";
import Booking from "./models/Booking.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cloud_name = process.env.CLOUD_NAME || "divjudlma";
const api_key = process.env.CLD_API_KEY || "777771633983597";
const api_secret = process.env.API_SECRET || "wiWpI2rvYE53pqLGcJT5txLEJ5c";

cloudinary.config({
  cloud_name: cloud_name,
  api_key: api_key,
  api_secret: api_secret,
});

async function handleUpload(file) {
  const result = await cloudinary.uploader.upload(file, {
    resource_type: "auto",
  });
  return result;
}

const app = express();
dotenv.config();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    credentials: true,
    origin: process.env.CORS_ORIGIN,
  })
);
app.use("/uploads", express.static(__dirname + "/uploads"));

const connectToDB = () => {
  mongoose.connect(process.env.DB_URL);
};

const saltRounds = process.env.SALT_ROUNDS;
const bcryptSalt = bcrypt.genSaltSync(parseInt(saltRounds));

app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    connectToDB();
    const user = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(user);
  } catch (error) {
    res.status(422).json(error);
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    connectToDB();
    const user = await User.findOne({ email });
    if (user) {
      const passwordOk = bcrypt.compareSync(password, user.password);
      if (passwordOk) {
        const token = jwt.sign(
          { email: user.email, id: user._id },
          process.env.JWT_SECRET_KEY
        );
        res.cookie("token", token).json(user);
      } else {
        res.status(422).json("Invalid email or password");
      }
    } else {
      res.status(422).json("not found");
    }
  } catch (error) {
    res.status(422).json(error);
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const { token } = req.cookies;
    if (token) {
      connectToDB();
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      const userInfo = await User.findById(decoded.id);
      const { password, ...userInfoWithoutPassword } = userInfo.toJSON();
      res.json(userInfoWithoutPassword);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.post("/api/logout", (req, res) => {
  res.cookie("token", "").json("Logout successful");
});

const upload = Multer({ dest: "/tmp" });
app.post("/api/upload", upload.array("my_files", 100), async (req, res) => {
  try {
    let uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(file);
      const cldRes = await handleUpload(file.path);
      uploadedFiles.push(cldRes.secure_url);
    }
    res.json(uploadedFiles);
  } catch (error) {
    console.log("error", error);
    res.status(500).send("Something went wrong");
  }
});

app.post("/api/upload-by-link", async (req, res) => {
  try {
    const { link } = req.body;
    const newName = "photo" + Date.now() + ".jpg";
    await imageDownloader.image({
      url: link,
      dest: "/tmp/" + newName,
    });
    console.log(process.env.CLD_API_KEY, typeof process.env.CLD_API_KEY);
    const cldRes = await handleUpload("/tmp/" + newName);
    res.json(cldRes.secure_url);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.post("/api/places", async (req, res) => {
  try {
    const { token } = req.cookies;
    const {
      title,
      description,
      addedPhotos: photos,
      address,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    connectToDB();
    const placeDoc = await Place.create({
      owner: decoded.id,
      title,
      description,
      photos,
      address,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    });
    res.json(placeDoc);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.get("/api/user-places", async (req, res) => {
  try {
    const { token } = req.cookies;
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const { id } = decoded;
    connectToDB();
    const places = await Place.find({ owner: id });
    res.json(places);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.get("/api/places/:id", async (req, res) => {
  try {
    const { id } = req.params;
    connectToDB();
    const place = await Place.findById(id);
    res.json(place);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.put("/api/places/:id", async (req, res) => {
  try {
    connectToDB();
    const { token } = req.cookies;
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const { id } = req.params;
    const {
      title,
      description,
      addedPhotos: photos,
      address,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;
    const placeDoc = await Place.findOneAndUpdate(
      { _id: id, owner: decoded.id },
      {
        title,
        description,
        photos,
        address,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      },
      { new: true }
    );
    res.json(placeDoc);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.get("/api/places", async (req, res) => {
  try {
    connectToDB();
    const places = await Place.find();
    res.json(places);
  } catch (error) {
    res.status(500).json("Something went wrong");
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    connectToDB();
    const { token } = req.cookies;
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const { place, checkIn, checkOut, numberOfGuests, name, phone, price } =
      req.body;
    const bookingDoc = await Booking.create({
      place,
      user: decoded.id,
      checkIn,
      checkOut,
      numberOfGuests,
      name,
      phone,
      price,
    });
    res.json(bookingDoc);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.get("/api/bookings", async (req, res) => {
  try {
    connectToDB();
    const { token } = req.cookies;
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const bookings = await Booking.find({ user: decoded.id }).populate("place");
    res.json(bookings);
  } catch (error) {
    console.log("error", error);
    res.status(500).json("Something went wrong");
  }
});

app.listen(4000, () => {
  console.log("Server Listening on port 4000");
});
