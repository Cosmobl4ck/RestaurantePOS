-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: restaurante
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `clientes`
--

DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `direccion` text,
  `telefono` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clientes`
--

LOCK TABLES `clientes` WRITE;
/*!40000 ALTER TABLE `clientes` DISABLE KEYS */;
INSERT INTO `clientes` VALUES (1,'Clientes varios','Aqui','12345678','2025-11-19 05:16:23'),(2,'Consumidor final',NULL,NULL,'2025-11-19 05:27:48'),(3,'Canju','LA','+1234567890','2025-11-30 06:51:31');
/*!40000 ALTER TABLE `clientes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion_impresion`
--

DROP TABLE IF EXISTS `configuracion_impresion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_impresion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_negocio` varchar(100) NOT NULL,
  `direccion` text,
  `telefono` varchar(20) DEFAULT NULL,
  `nit` varchar(50) DEFAULT NULL,
  `pie_pagina` text,
  `ancho_papel` int DEFAULT '80',
  `font_size` int DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `logo_data` longblob,
  `logo_tipo` varchar(50) DEFAULT NULL,
  `qr_data` longblob,
  `qr_tipo` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion_impresion`
--

LOCK TABLES `configuracion_impresion` WRITE;
/*!40000 ALTER TABLE `configuracion_impresion` DISABLE KEYS */;
INSERT INTO `configuracion_impresion` VALUES (1,'Mi Negocio','Dirección del Negocio','Teléfono',NULL,'¡Gracias por su compra!',80,1,'2025-11-19 05:13:31','2025-11-19 05:13:31',NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `configuracion_impresion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cortes_caja`
--

DROP TABLE IF EXISTS `cortes_caja`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cortes_caja` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `turno` int NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `monto_inicial` decimal(10,2) DEFAULT '0.00',
  `ventas_efectivo` decimal(10,2) DEFAULT '0.00',
  `monto_final` decimal(10,2) DEFAULT '0.00',
  `diferencia` decimal(10,2) DEFAULT '0.00',
  `detalles_dinero` json DEFAULT NULL,
  `estado` enum('abierta','cerrada') DEFAULT 'abierta',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cerrado_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cortes_caja`
--

LOCK TABLES `cortes_caja` WRITE;
/*!40000 ALTER TABLE `cortes_caja` DISABLE KEYS */;
INSERT INTO `cortes_caja` VALUES (1,'2025-11-30',1,5,266.00,0.00,0.00,0.00,'{\"1\": \"25\", \"5\": \"4\", \"10\": \"1\", \"20\": \"1\", \"50\": \"1\", \"0.1\": \"100\", \"100\": \"1\", \"0.05\": \"20\", \"0.25\": \"20\"}','abierta','2025-11-30 18:29:39',NULL),(2,'2025-12-01',1,5,425.00,0.00,0.00,0.00,'{\"10\": \"10\", \"20\": \"5\", \"50\": \"2\", \"100\": \"1\", \"0.25\": \"100\"}','abierta','2025-12-01 18:33:45',NULL);
/*!40000 ALTER TABLE `cortes_caja` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detalle_factura`
--

DROP TABLE IF EXISTS `detalle_factura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detalle_factura` (
  `id` int NOT NULL AUTO_INCREMENT,
  `factura_id` int DEFAULT NULL,
  `producto_id` int DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `unidad_medida` enum('KG','UND','LB') DEFAULT 'KG',
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `factura_id` (`factura_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `detalle_factura_ibfk_1` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`),
  CONSTRAINT `detalle_factura_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detalle_factura`
--

LOCK TABLES `detalle_factura` WRITE;
/*!40000 ALTER TABLE `detalle_factura` DISABLE KEYS */;
INSERT INTO `detalle_factura` VALUES (1,1,1,2.00,1.00,'UND',2.00),(2,2,1,2.00,1.00,'UND',2.00),(3,3,1,2.00,1.00,'UND',2.00),(4,4,1,2.00,1.00,'UND',2.00),(5,5,1,1.00,1.00,'UND',1.00),(6,5,2,2.00,12.00,'UND',24.00),(7,6,1,1.00,1.00,'UND',1.00),(8,7,1,1.00,1.00,'UND',1.00),(9,8,1,1.00,1.00,'UND',1.00),(10,8,1,5.00,1.00,'UND',5.00),(11,8,1,1.00,1.00,'UND',1.00),(12,9,2,8.00,1.00,'UND',8.00),(13,9,4,2.00,10.00,'UND',20.00),(14,9,5,1.00,7.00,'UND',7.00),(15,9,6,2.00,8.00,'UND',16.00),(16,9,2,1.00,1.00,'UND',1.00),(17,9,3,3.00,1.00,'UND',3.00),(18,9,2,7.00,1.00,'UND',7.00),(19,10,2,1.00,1.00,'UND',1.00),(20,10,3,1.00,1.00,'UND',1.00),(21,10,6,2.00,8.00,'UND',16.00),(22,10,5,1.00,7.00,'UND',7.00),(23,11,2,6.00,1.00,'UND',6.00),(24,11,3,1.00,1.00,'UND',1.00),(25,11,1,1.00,1.00,'UND',1.00),(26,11,3,14.00,1.00,'UND',14.00),(27,11,3,3.00,1.00,'UND',3.00),(28,11,1,1.00,1.00,'UND',1.00),(29,11,3,1.00,1.00,'UND',1.00),(30,11,1,1.00,1.00,'UND',1.00),(31,11,1,100.00,1.00,'UND',100.00),(32,11,2,200.00,1.00,'UND',200.00),(33,12,1,1.00,1.00,'UND',1.00),(34,12,2,2.00,1.00,'UND',2.00),(35,13,1,1.00,1.00,'UND',1.00),(36,13,3,1.00,1.00,'UND',1.00),(37,14,1,1.00,1.00,'UND',1.00),(38,14,3,1.00,1.00,'UND',1.00),(39,14,4,1.00,10.00,'UND',10.00),(40,15,2,1.00,1.00,'UND',1.00),(41,15,4,1.00,10.00,'UND',10.00),(42,16,2,1.00,1.00,'UND',1.00),(43,16,4,1.00,10.00,'UND',10.00),(44,17,2,1.00,1.00,'UND',1.00),(45,18,2,1.00,1.00,'UND',1.00),(46,19,1,48.00,1.25,'UND',60.00),(47,20,2,1.00,1.00,'UND',1.00),(48,21,2,1.00,1.00,'UND',1.00),(49,22,2,2.00,1.00,'UND',2.00),(50,22,4,1.00,10.00,'UND',10.00);
/*!40000 ALTER TABLE `detalle_factura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `facturas`
--

DROP TABLE IF EXISTS `facturas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `facturas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int DEFAULT NULL,
  `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `total` decimal(10,2) NOT NULL,
  `forma_pago` enum('efectivo','transferencia') NOT NULL DEFAULT 'efectivo',
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `facturas_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `facturas`
--

LOCK TABLES `facturas` WRITE;
/*!40000 ALTER TABLE `facturas` DISABLE KEYS */;
INSERT INTO `facturas` VALUES (1,1,'2025-11-19 05:18:05',2.00,'efectivo'),(2,1,'2025-11-19 05:27:59',2.00,'efectivo'),(3,1,'2025-11-22 03:52:20',2.00,'efectivo'),(4,1,'2025-11-22 05:12:44',2.00,'efectivo'),(5,1,'2025-11-22 23:50:16',25.00,'efectivo'),(6,1,'2025-11-23 00:02:07',1.00,'efectivo'),(7,1,'2025-11-23 00:03:36',1.00,'efectivo'),(8,2,'2025-11-29 23:19:55',7.00,'efectivo'),(9,2,'2025-11-30 01:00:30',62.00,'efectivo'),(10,2,'2025-11-30 01:56:17',25.00,'efectivo'),(11,2,'2025-11-30 02:28:06',328.00,'efectivo'),(12,2,'2025-11-30 02:34:21',3.00,'efectivo'),(13,2,'2025-11-30 02:35:43',2.00,'efectivo'),(14,2,'2025-11-30 02:45:19',12.00,'efectivo'),(15,2,'2025-11-30 06:52:55',11.00,'efectivo'),(16,2,'2025-11-30 06:56:13',11.00,'efectivo'),(17,2,'2025-11-30 16:01:46',1.00,'efectivo'),(18,2,'2025-11-30 16:05:25',1.00,'efectivo'),(19,2,'2025-11-30 16:09:57',60.00,'efectivo'),(20,2,'2025-11-30 16:19:21',1.00,'efectivo'),(21,1,'2025-11-30 17:11:57',1.00,'efectivo'),(22,1,'2025-12-01 18:32:20',12.00,'efectivo');
/*!40000 ALTER TABLE `facturas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mesas`
--

DROP TABLE IF EXISTS `mesas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mesas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `descripcion` varchar(100) DEFAULT NULL,
  `estado` enum('libre','ocupada','reservada','bloqueada') DEFAULT 'libre',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mesas`
--

LOCK TABLES `mesas` WRITE;
/*!40000 ALTER TABLE `mesas` DISABLE KEYS */;
INSERT INTO `mesas` VALUES (1,'MESA 01',NULL,'libre','2025-11-30 16:50:37','2025-12-01 18:32:20'),(2,'MESA 02',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(3,'MESA 03',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(4,'MESA 04',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(5,'MESA 05',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(6,'MESA 06',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(7,'MESA 07',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(8,'MESA 08',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(9,'MESA 09',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(10,'MESA 10',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(11,'MESA 11',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(12,'MESA 12',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(13,'MESA 13',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(14,'MESA 14',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(15,'MESA 15',NULL,'libre','2025-11-30 16:50:37','2025-11-30 17:11:57'),(16,'BAR 01',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(17,'BAR 02',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(18,'BAR 03',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(19,'BAR 04',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(20,'BAR 05',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(21,'JEFE',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(22,'EMPLEADOS',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37'),(23,'LLEVAR',NULL,'libre','2025-11-30 16:50:37','2025-11-30 16:50:37');
/*!40000 ALTER TABLE `mesas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedido_items`
--

DROP TABLE IF EXISTS `pedido_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedido_id` int NOT NULL,
  `producto_id` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `unidad_medida` enum('KG','UND','LB') DEFAULT 'UND',
  `precio_unitario` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `estado` enum('pendiente','enviado','preparando','listo','servido','cancelado') DEFAULT 'pendiente',
  `nota` text,
  `enviado_at` timestamp NULL DEFAULT NULL,
  `preparado_at` timestamp NULL DEFAULT NULL,
  `listo_at` timestamp NULL DEFAULT NULL,
  `servido_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `pedido_items_ibfk_1` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`),
  CONSTRAINT `pedido_items_ibfk_2` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedido_items`
--

LOCK TABLES `pedido_items` WRITE;
/*!40000 ALTER TABLE `pedido_items` DISABLE KEYS */;
INSERT INTO `pedido_items` VALUES (1,1,1,2.00,'UND',1.00,2.00,'servido','zero','2025-11-19 05:27:40','2025-11-22 03:47:05','2025-11-22 03:47:06','2025-11-22 03:51:17','2025-11-19 05:27:36','2025-11-22 03:51:17'),(2,2,1,2.00,'UND',1.00,2.00,'servido',NULL,'2025-11-22 03:51:53','2025-11-22 22:49:13','2025-11-22 22:49:13',NULL,'2025-11-19 13:53:02','2025-11-30 02:27:50'),(3,5,1,1.00,'UND',1.00,1.00,'servido','sin hielo','2025-11-22 04:29:56','2025-11-22 04:30:25','2025-11-22 04:30:27','2025-11-22 04:30:43','2025-11-22 04:29:51','2025-11-22 04:30:43'),(4,5,2,2.00,'UND',12.00,24.00,'servido','sin arroz, casamiento','2025-11-22 04:34:21','2025-11-22 04:34:36','2025-11-22 04:34:40','2025-11-22 04:34:43','2025-11-22 04:34:19','2025-11-22 04:34:43'),(5,7,1,2.00,'UND',1.00,2.00,'servido','En jarra con hielo','2025-11-22 05:11:09','2025-11-22 05:11:30','2025-11-22 05:11:31','2025-11-22 05:11:35','2025-11-22 05:11:05','2025-11-22 05:11:35'),(6,9,1,1.00,'UND',1.00,1.00,'servido',NULL,NULL,NULL,NULL,NULL,'2025-11-23 00:01:57','2025-11-30 02:27:50'),(7,10,1,1.00,'UND',1.00,1.00,'servido',NULL,NULL,NULL,NULL,NULL,'2025-11-23 00:03:22','2025-11-30 02:27:50'),(8,11,1,1.00,'UND',1.00,1.00,'servido',NULL,NULL,NULL,NULL,NULL,'2025-11-29 22:19:18','2025-11-30 02:27:50'),(9,11,1,5.00,'UND',1.00,5.00,'servido',NULL,NULL,NULL,NULL,NULL,'2025-11-29 22:40:11','2025-11-30 02:27:50'),(10,11,1,1.00,'UND',1.00,1.00,'servido',NULL,NULL,NULL,NULL,NULL,'2025-11-29 23:15:23','2025-11-30 02:27:50'),(11,12,2,8.00,'UND',1.00,8.00,'servido','Hielo, vaso grande','2025-11-29 23:43:33',NULL,NULL,NULL,'2025-11-29 23:43:07','2025-11-30 02:27:50'),(12,12,4,2.00,'UND',10.00,20.00,'servido','Sin arroz','2025-11-29 23:43:33','2025-11-29 23:50:48','2025-11-29 23:50:48','2025-11-29 23:50:53','2025-11-29 23:43:32','2025-11-29 23:50:53'),(13,12,5,1.00,'UND',7.00,7.00,'servido',NULL,'2025-11-29 23:53:13','2025-11-30 00:59:51','2025-11-30 00:59:54','2025-11-30 01:00:00','2025-11-29 23:52:44','2025-11-30 01:00:00'),(14,12,6,2.00,'UND',8.00,16.00,'servido',NULL,'2025-11-29 23:53:13','2025-11-30 00:59:53','2025-11-30 00:59:56','2025-11-30 01:00:01','2025-11-29 23:52:54','2025-11-30 01:00:01'),(15,12,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-29 23:53:13',NULL,NULL,NULL,'2025-11-29 23:53:03','2025-11-30 02:27:50'),(16,12,3,3.00,'UND',1.00,3.00,'servido',NULL,'2025-11-29 23:53:13',NULL,NULL,NULL,'2025-11-29 23:53:11','2025-11-30 02:27:50'),(17,12,2,7.00,'UND',1.00,7.00,'servido','SIN HIELO','2025-11-30 00:59:02',NULL,NULL,NULL,'2025-11-30 00:59:00','2025-11-30 02:27:50'),(18,13,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 01:00:56',NULL,NULL,NULL,'2025-11-30 01:00:46','2025-11-30 02:27:50'),(19,13,3,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 01:00:56',NULL,NULL,NULL,'2025-11-30 01:00:54','2025-11-30 02:27:50'),(20,8,2,6.00,'UND',1.00,6.00,'servido',NULL,'2025-11-30 01:43:10',NULL,NULL,NULL,'2025-11-30 01:42:54','2025-11-30 02:25:22'),(21,8,3,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 01:43:10',NULL,NULL,NULL,'2025-11-30 01:43:02','2025-11-30 02:25:22'),(22,8,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 01:43:10',NULL,NULL,NULL,'2025-11-30 01:43:08','2025-11-30 02:25:22'),(23,8,3,14.00,'UND',1.00,14.00,'servido','sin hielo','2025-11-30 01:47:42',NULL,NULL,NULL,'2025-11-30 01:47:39','2025-11-30 02:25:22'),(24,8,3,3.00,'UND',1.00,3.00,'servido','sin hielo','2025-11-30 01:50:37',NULL,NULL,NULL,'2025-11-30 01:50:26','2025-11-30 02:25:22'),(25,8,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 01:50:37',NULL,NULL,NULL,'2025-11-30 01:50:35','2025-11-30 02:25:22'),(26,13,6,2.00,'UND',8.00,16.00,'servido',NULL,'2025-11-30 01:51:31','2025-11-30 01:51:41','2025-11-30 01:51:50','2025-11-30 01:51:57','2025-11-30 01:51:07','2025-11-30 01:51:57'),(27,13,5,1.00,'UND',7.00,7.00,'servido','Con papas fritas','2025-11-30 01:51:31','2025-11-30 01:51:43','2025-11-30 01:51:51','2025-11-30 01:51:58','2025-11-30 01:51:29','2025-11-30 01:51:58'),(28,8,3,1.00,'UND',1.00,1.00,'servido','11','2025-11-30 01:52:45',NULL,NULL,NULL,'2025-11-30 01:52:43','2025-11-30 02:25:22'),(29,8,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:10:22',NULL,NULL,NULL,'2025-11-30 02:10:20','2025-11-30 02:25:22'),(30,8,1,100.00,'UND',1.00,100.00,'servido',NULL,'2025-11-30 02:23:51',NULL,NULL,NULL,'2025-11-30 02:23:50','2025-11-30 02:25:22'),(31,8,2,200.00,'UND',1.00,200.00,'servido',NULL,'2025-11-30 02:24:59',NULL,NULL,NULL,'2025-11-30 02:24:57','2025-11-30 02:25:22'),(32,15,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:28:37',NULL,NULL,NULL,'2025-11-30 02:28:35','2025-11-30 02:29:17'),(33,15,2,2.00,'UND',1.00,2.00,'servido',NULL,'2025-11-30 02:28:59',NULL,NULL,NULL,'2025-11-30 02:28:56','2025-11-30 02:29:17'),(34,16,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:34:42',NULL,NULL,NULL,'2025-11-30 02:34:41','2025-11-30 02:34:49'),(35,16,3,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:35:01',NULL,NULL,NULL,'2025-11-30 02:34:58','2025-11-30 02:35:07'),(36,17,1,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:36:37',NULL,NULL,NULL,'2025-11-30 02:36:21','2025-11-30 02:36:43'),(37,17,3,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 02:43:43',NULL,NULL,NULL,'2025-11-30 02:43:34','2025-11-30 02:43:57'),(38,17,4,1.00,'UND',10.00,10.00,'servido',NULL,'2025-11-30 02:43:43','2025-11-30 02:43:49','2025-11-30 02:43:49','2025-11-30 02:43:52','2025-11-30 02:43:41','2025-11-30 02:43:52'),(39,18,2,1.00,'UND',1.00,1.00,'servido','Con mucho Hielo','2025-11-30 06:50:24',NULL,NULL,NULL,'2025-11-30 06:50:02','2025-11-30 06:50:47'),(40,18,4,1.00,'UND',10.00,10.00,'servido','Con casamiento en vez de arroz','2025-11-30 06:50:24','2025-11-30 06:50:32','2025-11-30 06:50:54','2025-11-30 06:50:58','2025-11-30 06:50:21','2025-11-30 06:50:58'),(41,19,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 06:55:33',NULL,NULL,NULL,'2025-11-30 06:55:20','2025-11-30 06:55:48'),(42,19,4,1.00,'UND',10.00,10.00,'listo',NULL,'2025-11-30 06:55:33','2025-11-30 06:55:42','2025-11-30 06:55:42',NULL,'2025-11-30 06:55:31','2025-11-30 06:55:42'),(43,22,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 16:01:28',NULL,NULL,NULL,'2025-11-30 16:01:25','2025-11-30 16:01:34'),(44,24,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 16:04:48',NULL,NULL,NULL,'2025-11-30 16:04:46','2025-11-30 16:04:53'),(45,25,1,48.00,'UND',1.25,60.00,'servido',NULL,'2025-11-30 16:09:14',NULL,NULL,NULL,'2025-11-30 16:09:10','2025-11-30 16:09:34'),(46,26,2,1.00,'UND',1.00,1.00,'servido',NULL,'2025-11-30 16:18:46',NULL,NULL,NULL,'2025-11-30 16:18:45','2025-11-30 16:18:51'),(47,30,2,1.00,'UND',1.00,1.00,'servido','1','2025-11-30 17:11:12',NULL,NULL,NULL,'2025-11-30 17:10:54','2025-11-30 17:11:29'),(48,31,2,2.00,'UND',1.00,2.00,'servido','Mucho hielo','2025-12-01 18:31:30',NULL,NULL,NULL,'2025-12-01 18:31:13','2025-12-01 18:31:55'),(49,31,4,1.00,'UND',10.00,10.00,'servido','Termino medio','2025-12-01 18:31:30','2025-12-01 18:31:40','2025-12-01 18:31:43','2025-12-01 18:31:47','2025-12-01 18:31:27','2025-12-01 18:31:47');
/*!40000 ALTER TABLE `pedido_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedidos`
--

DROP TABLE IF EXISTS `pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mesa_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `estado` enum('abierto','en_cocina','preparando','listo','servido','cerrado','cancelado') DEFAULT 'abierto',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `notas` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `estado_bar` enum('pendiente','listo','entregado') DEFAULT 'pendiente',
  PRIMARY KEY (`id`),
  KEY `mesa_id` (`mesa_id`),
  KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `pedidos_ibfk_1` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id`),
  CONSTRAINT `pedidos_ibfk_2` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedidos`
--

LOCK TABLES `pedidos` WRITE;
/*!40000 ALTER TABLE `pedidos` DISABLE KEYS */;
INSERT INTO `pedidos` VALUES (1,1,NULL,'cerrado',2.00,NULL,'2025-11-19 05:27:14','2025-11-19 05:27:59','pendiente'),(2,2,NULL,'cerrado',2.00,NULL,'2025-11-19 13:52:53','2025-11-22 03:52:20','pendiente'),(3,1,NULL,'cancelado',0.00,NULL,'2025-11-22 03:44:48','2025-11-22 04:28:17','pendiente'),(4,1,NULL,'cancelado',0.00,NULL,'2025-11-22 04:28:28','2025-11-30 02:28:22','pendiente'),(5,3,NULL,'cerrado',25.00,NULL,'2025-11-22 04:29:23','2025-11-22 23:50:16','pendiente'),(6,2,NULL,'cancelado',0.00,NULL,'2025-11-22 04:38:28','2025-11-30 02:28:18','pendiente'),(7,4,NULL,'cerrado',2.00,NULL,'2025-11-22 05:10:37','2025-11-22 05:12:44','pendiente'),(8,3,NULL,'cerrado',328.00,NULL,'2025-11-22 23:52:52','2025-11-30 02:28:06','entregado'),(9,4,NULL,'cerrado',1.00,NULL,'2025-11-22 23:59:32','2025-11-23 00:02:07','pendiente'),(10,4,NULL,'cerrado',1.00,NULL,'2025-11-23 00:02:56','2025-11-23 00:03:36','pendiente'),(11,4,NULL,'cerrado',7.00,NULL,'2025-11-26 04:38:15','2025-11-29 23:19:55','pendiente'),(12,4,NULL,'cerrado',62.00,NULL,'2025-11-29 23:20:08','2025-11-30 01:00:30','pendiente'),(13,4,NULL,'cerrado',25.00,NULL,'2025-11-30 01:00:37','2025-11-30 01:56:17','entregado'),(14,4,NULL,'cancelado',0.00,NULL,'2025-11-30 02:24:44','2025-11-30 02:28:15','pendiente'),(15,4,NULL,'cerrado',3.00,NULL,'2025-11-30 02:28:28','2025-11-30 02:34:21','entregado'),(16,4,NULL,'cerrado',2.00,NULL,'2025-11-30 02:34:28','2025-11-30 02:35:43','entregado'),(17,4,NULL,'cerrado',12.00,NULL,'2025-11-30 02:36:05','2025-11-30 02:45:19','entregado'),(18,4,NULL,'cerrado',11.00,NULL,'2025-11-30 06:48:39','2025-11-30 06:52:55','entregado'),(19,5,NULL,'cerrado',11.00,NULL,'2025-11-30 06:51:55','2025-11-30 06:56:13','entregado'),(20,5,NULL,'cancelado',0.00,NULL,'2025-11-30 06:56:44','2025-11-30 07:04:38','pendiente'),(21,2,NULL,'cancelado',0.00,NULL,'2025-11-30 07:04:45','2025-11-30 16:03:11','pendiente'),(22,4,NULL,'cerrado',1.00,NULL,'2025-11-30 16:01:04','2025-11-30 16:01:46','entregado'),(23,4,NULL,'cancelado',0.00,NULL,'2025-11-30 16:02:55','2025-11-30 16:03:01','pendiente'),(24,5,NULL,'cerrado',1.00,NULL,'2025-11-30 16:04:13','2025-11-30 16:05:25','entregado'),(25,6,NULL,'cerrado',60.00,NULL,'2025-11-30 16:08:37','2025-11-30 16:09:57','entregado'),(26,3,NULL,'cerrado',1.00,NULL,'2025-11-30 16:18:36','2025-11-30 16:19:21','entregado'),(27,3,NULL,'cancelado',0.00,NULL,'2025-11-30 16:19:36','2025-11-30 16:19:50','pendiente'),(28,6,NULL,'cancelado',0.00,NULL,'2025-11-30 16:20:29','2025-11-30 16:20:41','pendiente'),(29,5,NULL,'abierto',0.00,NULL,'2025-11-30 16:26:19','2025-11-30 16:26:19','pendiente'),(30,15,NULL,'cerrado',1.00,NULL,'2025-11-30 17:10:10','2025-11-30 17:11:57','entregado'),(31,1,NULL,'cerrado',12.00,NULL,'2025-12-01 18:30:54','2025-12-01 18:32:20','entregado');
/*!40000 ALTER TABLE `pedidos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `productos`
--

DROP TABLE IF EXISTS `productos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `productos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio_kg` decimal(10,2) NOT NULL DEFAULT '0.00',
  `precio_unidad` decimal(10,2) NOT NULL DEFAULT '0.00',
  `precio_libra` decimal(10,2) NOT NULL DEFAULT '0.00',
  `categoria` varchar(20) NOT NULL DEFAULT 'cocina',
  `stock` int NOT NULL DEFAULT '0',
  `activo` tinyint DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `productos`
--

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
INSERT INTO `productos` VALUES (1,'BR-001','Agua',0.00,1.25,0.00,'bar',0,1,'2025-11-29 23:34:30','2025-11-30 16:09:10'),(2,'BR-002','Coca Cola',0.00,1.00,0.00,'bar',19,1,'2025-11-29 23:37:14','2025-12-01 18:31:13'),(3,'BR-003','Fanta',0.00,1.00,0.00,'bar',24,1,'2025-11-29 23:37:54','2025-11-29 23:37:54'),(4,'KTC-001','CHURRASCO TIPICO',0.00,10.00,0.00,'cocina',0,1,'2025-11-29 23:39:27','2025-11-29 23:39:27'),(5,'KTC-002','PECHUGA A LA PLANCHA 6OZ',0.00,7.00,0.00,'cocina',0,1,'2025-11-29 23:40:02','2025-11-29 23:40:02'),(6,'KTC-003','PECHUGA A LA PLANCHA 8OZ',0.00,8.00,0.00,'cocina',0,1,'2025-11-29 23:40:19','2025-11-29 23:40:19');
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `pin_hash` varchar(255) NOT NULL,
  `rol` enum('admin','gerente','mesero','cajero','cocina','bar') NOT NULL,
  `activo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'Katherine Cucufate','$2b$10$...','mesero',1),(2,'Erika Flores','$2b$10$...','cajero',1),(3,'Nestor Mejia','$2b$10$...','gerente',1),(4,'Equipo Cocina','$2b$10$...','cocina',1),(5,'Nestor Mejia','$2b$10$ucicK02RuDqPpl5VO6Ssmu2wp0gLn0XDQBfDnIBN6XclxLyC8IxW6','gerente',1),(6,'Katherine Mesera','$2b$10$ucicK02RuDqPpl5VO6Ssmualm.9eWSvylLv3FNFkvgZLZFui9dX.y','mesero',1),(7,'Erika Cajera','$2b$10$ucicK02RuDqPpl5VO6SsmuuyPgWDAavyCFhTjTEP7EUrPbQrE42q6','cajero',1),(8,'Equipo Cocina','$2b$10$ucicK02RuDqPpl5VO6SsmuqltbLUckIHDoQ6Fsh/YryduCJbIQPDS','cocina',1),(9,'Henrry Marroquin','$2b$10$9MyPwdCOW.FQrCl4fiW6lOJGfnsVO.5AMyl44e7P4m8QlcyXqx45W','bar',1);
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-12 13:16:40
