using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

internal static class Program
{
    private static TcpListener listener;
    private static Dictionary<string, byte[]> files;

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        bool openBrowser = true;
        int port = 0;
        foreach (string arg in args)
        {
            if (arg == "--no-browser")
            {
                openBrowser = false;
            }
            else if (arg.StartsWith("--port=", StringComparison.Ordinal))
            {
                if (!int.TryParse(arg.Substring(7), out port) || port < 1 || port > 65535)
                {
                    Console.Error.WriteLine("端口无效：" + arg);
                    return 2;
                }
            }
            else
            {
                Console.Error.WriteLine("未知选项：" + arg);
                return 2;
            }
        }

        try
        {
            files = LoadFiles();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("无法加载内嵌的游戏文件：" + error.Message);
            WaitIfInteractive();
            return 1;
        }

        try
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("无法启动本地游戏服务：" + error.Message);
            WaitIfInteractive();
            return 1;
        }

        int actualPort = ((IPEndPoint)listener.LocalEndpoint).Port;
        string url = "http://127.0.0.1:" + actualPort + "/";
        Console.Title = "璀璨宝石 - 双人同机";
        Console.WriteLine("璀璨宝石已启动：" + url);
        Console.WriteLine("关闭此窗口或按 Ctrl+C 可停止游戏服务。");
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
        {
            eventArgs.Cancel = true;
            listener.Stop();
        };

        if (openBrowser)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("无法自动打开浏览器：" + error.Message);
                Console.Error.WriteLine("请手动打开此地址：" + url);
            }
        }

        while (true)
        {
            try
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(delegate(object state) { Serve((TcpClient)state); }, client);
            }
            catch (SocketException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
        }

        return 0;
    }

    private static void Serve(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                NetworkStream stream = client.GetStream();
                StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
                string request = reader.ReadLine();
                if (request == null) return;

                string line;
                while (!string.IsNullOrEmpty(line = reader.ReadLine())) { }

                string[] parts = request.Split(' ');
                if (parts.Length < 2 || (parts[0] != "GET" && parts[0] != "HEAD"))
                {
                    WriteError(stream, 405, "Method Not Allowed");
                    return;
                }

                string path = Uri.UnescapeDataString(parts[1].Split('?')[0]).Replace('\\', '/');
                if (path == "/") path = "/index.html";
                if (!path.StartsWith("/", StringComparison.Ordinal) || path.Contains("../") || path.EndsWith("/..", StringComparison.Ordinal))
                {
                    WriteError(stream, 403, "Forbidden");
                    return;
                }
                byte[] body;
                if (!files.TryGetValue(path, out body))
                {
                    WriteError(stream, 404, "Not Found");
                    return;
                }

                string headers = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: " + ContentType(path) + "\r\n" +
                    "Content-Length: " + body.Length + "\r\n" +
                    "Cache-Control: no-store\r\n" +
                    "X-Content-Type-Options: nosniff\r\n" +
                    "Connection: close\r\n\r\n";
                byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
                stream.Write(headerBytes, 0, headerBytes.Length);
                if (parts[0] == "GET")
                {
                    stream.Write(body, 0, body.Length);
                }
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("请求失败：" + error.Message);
            }
        }
    }

    private static Dictionary<string, byte[]> LoadFiles()
    {
        Dictionary<string, byte[]> result = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("GameAssets"))
        {
            if (resource == null) throw new InvalidOperationException("缺少内嵌游戏资源。");
            using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (entry.Name.Length == 0) continue;
                    string path = "/" + entry.FullName.Replace('\\', '/').TrimStart('/');
                    using (Stream input = entry.Open())
                    using (MemoryStream output = new MemoryStream())
                    {
                        input.CopyTo(output);
                        result.Add(path, output.ToArray());
                    }
                }
            }
        }
        if (!result.ContainsKey("/index.html")) throw new InvalidOperationException("缺少 index.html。");
        return result;
    }

    private static string ContentType(string file)
    {
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg":
            case ".jpeg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    private static void WriteError(Stream stream, int code, string message)
    {
        byte[] body = Encoding.UTF8.GetBytes(message);
        string headers = "HTTP/1.1 " + code + " " + message + "\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            "Content-Length: " + body.Length + "\r\n" +
            "Connection: close\r\n\r\n";
        byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
        stream.Write(headerBytes, 0, headerBytes.Length);
        stream.Write(body, 0, body.Length);
    }

    private static void WaitIfInteractive()
    {
        if (Environment.UserInteractive && !Console.IsInputRedirected)
        {
            Console.WriteLine("按 Enter 键关闭。");
            Console.ReadLine();
        }
    }
}
