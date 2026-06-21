namespace ModularCA.Keystore.Crypto
{
    /// <summary>
    /// Reads and writes length-prefixed signature blocks in the keystore binary format.
    /// </summary>
    public static class KeystoreSignatureBlock
    {
        /// <summary>
        /// Writes a signature block (length-prefixed) to the binary writer.
        /// </summary>
        public static void Write(BinaryWriter writer, byte[]? signature)
        {
            if (signature == null)
            {
                writer.Write((ushort)0);
            }
            else
            {
                writer.Write((ushort)signature.Length);
                writer.Write(signature);
            }
        }

        /// <summary>
        /// Reads a length-prefixed signature block from the binary reader.
        /// </summary>
        public static byte[]? Read(BinaryReader reader)
        {
            var length = reader.ReadUInt16();
            return length == 0 ? null : reader.ReadBytes(length);
        }
    }

}
