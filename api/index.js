const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const imageDownloader = require('image-downloader');
const multer = require('multer');
const User = require('./models/User');
const Place = require('./models/Place');
const Booking = require('./models/Booking');
const fs = require('fs');
const Razorpay = require('razorpay');
const { response } = require('express');

const razorpay = new Razorpay({
  key_id: 'rzp_test_Yr7KaDTuV3HKdl',
  key_secret: 'JJMi0cRmWJIUOVs32eS7LTlE'
})
require('dotenv').config();
const app = express();


const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'fasefraw4r5r3wq45wdfgw34twdfg';

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(cors({
  credentials: true,
  origin: 'http://localhost:5173'
}))

mongoose.connect(process.env.MONGO_URL);
app.get('/', (req, res) => {
  res.json('hey Quickdeal time');
});
app.get('/test', (req, res) => {
  res.json('test ok');
});

function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      resolve(userData);
    });
  });
}


app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (e) {
    res.status(422).json(e);
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({
        email: userDoc.email,
        id: userDoc._id
      }, jwtSecret, {}, (err, token) => {
        if (err) res.status(500).send("Oops internal server error occured");
        res.cookie('token', token).json(userDoc);
      })
    } else {
      res.status(422).json('pass not ok');
    }
  }
  else {
    res.json(null);
  }
})

app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    })

  } else res.json(null);
})

app.post('/logout', (req, res) => {
  res.cookie('token', '').json(true);
});

app.post('/upload-by-link', async (req, res) => {
  const { link } = req.body;
  const newName = 'photo' + Date.now() + '.jpg';
  await imageDownloader.image({
    url: link,
    dest: __dirname + '/uploads/' + newName,
  });
  //const url = await uploadToS3('/tmp/' +newName, newName, mime.lookup('/tmp/' +newName));
  //res.json(url);
  console.log(newName);
  res.json(`uploads/${newName}`);
});

const photosMiddleware = multer({ dest: 'uploads/' });
app.post('/upload', photosMiddleware.array('photos', 100), async (req, res) => {
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const { path, originalname } = req.files[i];
    const parts = originalname.split('.')
    const ext = parts[parts.length - 1]
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath)
    // const url = await uploadToS3(path, originalname, mimetype);
    uploadedFiles.push(newPath);
  }

  res.json(uploadedFiles);
});


app.get('/user-places', (req, res) => {
  //mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    const { id } = userData;
    res.json(await Place.find({ owner: id }));
  });
});

app.post('/places', (req, res) => {
  //mongoose.connect(process.env.MONGO_URL);
  const { token } = req.cookies;
  const {
    title, address, addedPhotos, description, price,
    perks, extraInfo, checkIn, checkOut, maxGuests,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.create({
      owner: userData.id, price,
      title, address, photos: addedPhotos, description,
      perks, extraInfo, checkIn, checkOut, maxGuests,
    });
    res.json(placeDoc);
  });
});

app.get('/places/:id', async (req, res) => {
  const { id } = req.params;
  res.json(await Place.findById(id));
});

app.put('/places', async (req, res) => {
  const { token } = req.cookies;
  const {
    id, title, address, addedPhotos, description,
    perks, extraInfo, checkIn, checkOut, maxGuests, price,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.findById(id);
    if (userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title, address, photos: addedPhotos, description,
        perks, extraInfo, checkIn, checkOut, maxGuests, price,
      });
      await placeDoc.save();
      res.json('ok');
    }
  });
});

app.get('/places', async (req, res) => {
  res.json(await Place.find());
});

app.post('/bookings', async (req, res) => {
  const userData = await getUserDataFromReq(req);
  const {
    place, checkIn, checkOut, numberOfGuests, name, phone, price,
  } = req.body;
  const amount = price
  const currency = 'INR'

  const options = {
    amount: amount * 100,
    currency
  }
  let razorResponse;

  try {
    razorResponse = await razorpay.orders.create(options)
    console.log(response)
    // res.json({
    // 	id: response.id,
    // 	currency: response.currency,
    // 	amount: response.amount
    // })
  } catch (error) {
    console.log(error)
  }
  if (razorResponse) {
    Booking.create({
      place, checkIn, checkOut, numberOfGuests, name, phone, price,
      user: userData.id, razorID: razorResponse.id
    }).then((doc) => {
      res.json(doc);
    }).catch((err) => {
      throw err;
    });
  }
  else {

  }

});



app.get('/bookings', async (req, res) => {
  const userData = await getUserDataFromReq(req);
  res.json(await Booking.find({ user: userData.id }).populate('place'));
});


app.listen(5000);