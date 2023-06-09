var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const maxmind = require('maxmind');
const mongoose = require("mongoose");
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const catalogRouter = require("./routes/catalog");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const compression = require("compression");
const helmet = require("helmet");
const RateLimit = require("express-rate-limit");
const cors = require("cors"); 
const bcrypt = require('bcryptjs')
require('dotenv').config();
const User = require('./model/user')
var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(logger('dev'));
app.use(express.json());

passport.use(
  new LocalStrategy(async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email });
      if (!user) {
        return done(null, false, { message: "Incorrect email" });
      }

      bcrypt.compare(password, user.password, (err, res) => {
        if (res) {
          // passwords match! log user in
          return done(null, user)
        } else {
          // passwords do not match!
          return done(null, false, { message: "Incorrect password" })
        }
      })
      return done(null, user);
    } catch(err) {
      return done(err);
    };
  })
);

passport.deserializeUser(async function(id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch(err) {
    done(err);
  };
});

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(compression());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      "script-src": ["'self'", "code.jquery.com", "cdn.jsdelivr.net"],
    },
  })
);

const limiter = RateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
});





const geoipDatabasePath = path.join(__dirname, 'GeoIP2-City.mmdb');


const blockThaneVisitors = async (req, res, next) => {
  const clientIP = req.ip; 

  try {
    const geoData = await maxmind.open(geoipDatabasePath);
    const cityInfo = geoData.city(clientIP);

    if (cityInfo && cityInfo.city && cityInfo.city.names && cityInfo.city.names.en === 'Thane') {
      
      return res.status(403).send('Access forbidden');
    }
  } catch (error) {
    console.error('Error retrieving geolocation data:', error);
  }

  
  next();
};

// Apply the Thane blocking middleware to all routes
app.use(blockThaneVisitors);

const allowlist = ['https://inventryapp-production.up.railway.app/catalog', 'https://sumitshinde-84.github.io']
let corsOptionsDelegate = function (req, callback) {
  let corsOptions;
  if (allowlist.indexOf(req.header('Origin')) !== -1) {
    corsOptions = { origin: true }
  } else {
    corsOptions = { origin: false } 
  }
  callback(null, corsOptions) 
}

app.use(cors(corsOptionsDelegate));
app.use(limiter);
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use("/catalog", catalogRouter)

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

mongoose.set("strictQuery", false);
const mongoDB = process.env.MONGODB_URI;

main().catch((err) => console.log(err));
async function main() {
  await mongoose.connect(mongoDB);
}

module.exports = app;
