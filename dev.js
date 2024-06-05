const express = require("express");
const { createCanvas } = require("canvas");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

var cors = require("cors");
var app = express();
const port = 3000;

// Middleware untuk parsing JSON
app.use(bodyParser.json());
app.use(cors());
app.options("*", cors());

// Rate limiting middleware
const rateLimit = (limit, duration) => {
  let requests = {};
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip;

    if (!requests[ip]) {
      requests[ip] = { count: 1, lastRequest: now };
    } else {
      const timePassed = now - requests[ip].lastRequest;
      if (timePassed < duration) {
        if (requests[ip].count >= limit) {
          return res
            .status(429)
            .send("Too many requests. Please try again later.");
        } else {
          requests[ip].count++;
        }
      } else {
        requests[ip].count = 1;
        requests[ip].lastRequest = now;
      }
    }
    next();
  };
};

const oneRequestPerSecond = rateLimit(1, 1000);

const storageFolder = path.join(__dirname, "storage");
const edgesFilePath = "./storage/edges.json";
const hashFilePath = "./storage/edges_hash.txt";
const initialEdgesData = {
  reset: true,
  vertices: [],
  edges: [],
};

// Ensure edges.json exists with initial data
if (!fs.existsSync(edgesFilePath)) {
  fs.writeFileSync(edgesFilePath, JSON.stringify(initialEdgesData, null, 2));
}

// Function to compute hash of the edges.json content
function computeHash(data) {
  return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex");
}

// Read and store hash of initial edges.json
let lastHash = computeHash(initialEdgesData);
if (fs.existsSync(hashFilePath)) {
  lastHash = fs.readFileSync(hashFilePath, "utf-8");
} else {
  fs.writeFileSync(hashFilePath, lastHash);
}

app.post("/graph", cors(), (req, res) => {
  fs.readFile(edgesFilePath, (err, data) => {
    if (err) {
      return res.status(500).send("Error reading edges file.");
    }

    const graphData = JSON.parse(data);
    graphData.reset = false;

    const newHash = computeHash(graphData);

    if (newHash === lastHash) {
      // If the hash hasn't changed, return the last stored image
      const latestImage = getLatestImage();
      res.json({
        imageUrl: latestImage.url,
        imagePath: latestImage.path,
        lastUpdate: latestImage.lastUpdate,
      });
      return;
    }

    fs.writeFile(edgesFilePath, JSON.stringify(graphData, null, 2), (err) => {
      if (err) {
        return res.status(500).send("Error writing edges file.");
      }

      const { vertices, edges } = graphData;
      var datern = Date.now().toLocaleString("en-US", {
        timeZone: "Asia/Jakarta",
      });
      console.log(datern.replace(/,/g, ""));
      if (!vertices || !edges) {
        return res.status(400).send("Vertices and edges are required.");
      }

      const width = 400;
      const height = 400;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // Clear canvas
      ctx.fillStyle = "transparent";
      ctx.fillRect(0, 0, width, height);

      // font atas
      // masukText(ctx, width, "Graph Akademik", "20", "black", "30");
      //font bawah
      // masukText(ctx, width, "Kelompok 2", "15", "black", "50");

      // Draw axes
      ctx.strokeStyle = "transparent";
      ctx.beginPath();
      ctx.moveTo(50, 50);
      ctx.lineTo(50, 350);
      ctx.lineTo(350, 350);
      ctx.stroke();

      // Calculate positions for vertices in a circular layout
      const radius = 100;
      const centerX = width / 2;
      const centerY = height / 2;
      const angleStep = (2 * Math.PI) / vertices.length;

      const positionedVertices = vertices.map((vertex, index) => {
        const angle = index * angleStep;
        return {
          ...vertex,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });

      // Draw edges
      ctx.strokeStyle = "blue";
      edges.forEach((edge) => {
        const from = positionedVertices.find((v) => v.name === edge.from);
        const to = positionedVertices.find((v) => v.name === edge.to);
        if (from && to) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
      });

      // Draw vertices and names
      ctx.fillStyle = "red";
      ctx.font = "15px Arial";
      positionedVertices.forEach((vertex) => {
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        // Draw vertex name
        ctx.fillText(vertex.name, vertex.x + 10, vertex.y);
      });

      // Generate unique filename
      const fileName = `graph_${datern.replace(/,/g, "")}.png`;
      const filePath = `./storage/${fileName}`;

      // Save image to file system
      const out = fs.createWriteStream(filePath);
      const stream = canvas.createPNGStream();
      stream.pipe(out);
      out.on("finish", () => {
        console.log(`Image saved as ${filePath}`);
      });

      // Update the hash and store it
      lastHash = newHash;
      fs.writeFileSync(hashFilePath, lastHash);

      // Send image as response
      res.setHeader("Content-Type", "image/png");
      canvas.pngStream().pipe(res);
    });
  });
});

app.get("/", oneRequestPerSecond, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});
// Serve static files from the 'storage' folder
app.use("/storage", express.static(path.join(__dirname, "storage")));
app.get("/latestImage", cors(), (req, res) => {
  const latestImage = getLatestImage();
  res.json({
    imageUrl: latestImage.url,
    imagePath: latestImage.path,
    lastUpdate: latestImage.lastUpdate,
  });
});

app.post("/addVertice", cors(), oneRequestPerSecond, (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  const { name } = req.body;
  if (!name) {
    return res.status(400).send("Name is required.");
  }

  fs.readFile(edgesFilePath, (err, data) => {
    if (err) {
      return res.status(500).send("Error reading edges file.");
    }

    const edgesData = JSON.parse(data);
    edgesData.vertices.push({ name });

    fs.writeFile(edgesFilePath, JSON.stringify(edgesData, null, 2), (err) => {
      if (err) {
        return res.status(500).send("Error writing edges file.");
      }

      res.status(200).send(`Vertex added successfully from ${ip}.`);
    });
  });
});

app.post("/addEdge", cors(), oneRequestPerSecond, (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) {
    return res.status(400).send("From and to are required.");
  }

  fs.readFile(edgesFilePath, (err, data) => {
    if (err) {
      return res.status(500).send("Error reading edges file.");
    }

    const edgesData = JSON.parse(data);
    edgesData.edges.push({ from, to });

    fs.writeFile(edgesFilePath, JSON.stringify(edgesData, null, 2), (err) => {
      if (err) {
        return res.status(500).send("Error writing edges file.");
      }

      res.status(200).send("Edge added successfully.");
    });
  });
});

// app.post("/reset", cors(), (req, res) => {
//   fs.writeFile(
//     edgesFilePath,
//     JSON.stringify(initialEdgesData, null, 2),
//     (err) => {
//       if (err) {
//         return res.status(500).send("Error resetting edges file.");
//       }

//       // Update the hash and store it
//       lastHash = computeHash(initialEdgesData);
//       fs.writeFileSync(hashFilePath, lastHash);

//       res.status(200).send("Edges file reset successfully.");
//     }
//   );
// });

app.post("/reset", cors(), oneRequestPerSecond, (req, res) => {
  fs.writeFile(
    edgesFilePath,
    JSON.stringify(initialEdgesData, null, 2),
    (err) => {
      if (err) {
        return res.status(500).send("Error resetting edges file.");
      }

      // Delete all images in the storage folder
      fs.readdir(storageFolder, (err, files) => {
        if (err) {
          return res.status(500).send("Error reading storage folder.");
        }

        files.forEach((file) => {
          if (/\.(png|jpg|jpeg|gif)$/i.test(file)) {
            fs.unlink(path.join(storageFolder, file), (err) => {
              if (err) {
                console.error(`Error deleting file ${file}:`, err);
              }
            });
          }
        });

        // Update the hash and store it
        lastHash = computeHash(initialEdgesData);
        fs.writeFileSync(hashFilePath, lastHash);

        res
          .status(200)
          .send("Edges file reset and images deleted successfully.");
      });
    }
  );
});

function getLatestImage() {
  const storageFolder = path.join(__dirname, "storage");
  const files = fs.readdirSync(storageFolder);
  const imageFiles = files.filter((file) =>
    /^graph_\d+\.(png|jpg|jpeg|gif)$/i.test(file)
  );

  if (imageFiles.length === 0) {
    return { url: null, path: null, lastUpdate: null };
  }

  imageFiles.sort((a, b) => {
    const timestampA = parseInt(a.match(/\d+/)[0]);
    const timestampB = parseInt(b.match(/\d+/)[0]);
    return timestampB - timestampA;
  });

  const latestImage = `https://tubesprakpro.bhadrikais.my.id/storage/${imageFiles[0]}`;

  const pathImage = path.join("/storage", imageFiles[0]);
  return {
    url: latestImage,
    path: pathImage,
    lastUpdate: convertTimestamp(imageFiles[0]),
  };
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

function masukText(ctx, width, textvalue, size, color, height) {
  // Set text properties
  ctx.fillStyle = color; // Color of the text
  ctx.font = `${size}px Arial`; // Font size and style
  // Calculate the position to center the text
  // const text = convertTimestamp2(datern.replace(/,/g, ""));
  const text = textvalue;
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = 30; // Approximate height of the text

  const textX = (width - textWidth) / 2;
  const textY = height;
  // Write "hai" in the center of the canvas
  ctx.fillText(text, textX, textY);
}

function convertTimestamp(graphString) {
  // Hapus bagian 'graph_' dan '.png' dari string
  let timestampString = graphString.replace("graph_", "").replace(".png", "");

  // Konversi string timestamp menjadi angka
  let timestamp = parseInt(timestampString);

  // Konversi timestamp menjadi milidetik (jika timestamp dalam detik, kali 1000)
  let date = new Date(timestamp);

  // Array untuk hari-hari dalam seminggu
  let days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  // Array untuk bulan
  let months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  // Ambil informasi hari, tanggal, bulan, tahun, jam, menit
  let day = days[date.getUTCDay()];
  let dateOfMonth = date.getUTCDate();
  let month = months[date.getUTCMonth()];
  let year = date.getUTCFullYear();
  let hours = date.getUTCHours() + 7;
  let minutes = date.getUTCMinutes();

  // Format jam dan menit menjadi 2 digit
  if (hours < 10) hours = "0" + hours;
  if (minutes < 10) minutes = "0" + minutes;

  // Gabungkan semuanya ke dalam format yang diinginkan
  let formattedDate = `${day}, ${dateOfMonth} ${month} ${year} ${hours}:${minutes} WIB`;

  return formattedDate;
}

function convertTimestamp2(timestamp2) {
  // Konversi timestamp menjadi milidetik (jika timestamp dalam detik, kali 1000)
  let timestamp = parseInt(timestamp2);
  let date = new Date(timestamp);

  // Array untuk hari-hari dalam seminggu
  let days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  // Array untuk bulan
  let months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  // Ambil informasi hari, tanggal, bulan, tahun, jam, menit
  let day = days[date.getUTCDay()];
  let dateOfMonth = date.getUTCDate();
  let month = months[date.getUTCMonth()];
  let year = date.getUTCFullYear();
  let hours = date.getUTCHours() + 7;
  let minutes = date.getUTCMinutes();

  // Format jam dan menit menjadi 2 digit
  if (hours < 10) hours = "0" + hours;
  if (minutes < 10) minutes = "0" + minutes;

  // Gabungkan semuanya ke dalam format yang diinginkan
  let formattedDate = `${day}, ${dateOfMonth} ${month} ${year} ${hours}:${minutes} WIB`;
  console.log(formattedDate);
  return formattedDate;
}
