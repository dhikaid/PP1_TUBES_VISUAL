const express = require("express");
const { createCanvas } = require("canvas");
const bodyParser = require("body-parser");
const path = require("path"); // Import the path module
const fs = require("fs");

const app = express();
const port = 3000;

// Middleware untuk parsing JSON
app.use(bodyParser.json());

app.post("/graph", (req, res) => {
  const { vertices, edges } = req.body;

  if (!vertices || !edges) {
    return res.status(400).send("Vertices and edges are required.");
  }

  const width = 400;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Clear canvas
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  // Draw axes
  ctx.strokeStyle = "black";
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
  ctx.font = "12px Arial";
  positionedVertices.forEach((vertex) => {
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, 5, 0, 2 * Math.PI);
    ctx.fill();
    // Draw vertex name
    ctx.fillText(vertex.name, vertex.x + 10, vertex.y);
  });

  // Generate unique filename
  const fileName = `graph_${Date.now()}.png`;
  const filePath = `./storage/${fileName}`;

  // Save image to file system
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on("finish", () => {
    console.log(`Image saved as ${filePath}`);
  });

  // Send image as response
  res.setHeader("Content-Type", "image/png");
  canvas.pngStream().pipe(res);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});
// Serve static files from the 'storage' folder
app.use("/storage", express.static(path.join(__dirname, "storage")));
app.get("/latestImage", (req, res) => {
  const storageFolder = path.join(__dirname, "storage");
  fs.readdir(storageFolder, (err, files) => {
    if (err) {
      console.error("Error reading storage folder:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    const imageFiles = files.filter((file) =>
      /^graph_\d+\.(png|jpg|jpeg|gif)$/i.test(file)
    );

    if (imageFiles.length === 0) {
      res.json({ imageUrl: null });
      return;
    }

    imageFiles.sort((a, b) => {
      const timestampA = parseInt(a.match(/\d+/)[0]);
      const timestampB = parseInt(b.match(/\d+/)[0]);
      return timestampB - timestampA;
    });

    const latestImage = path.join("/storage", imageFiles[0]);
    res.json({ imageUrl: latestImage });
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
