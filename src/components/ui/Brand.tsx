import { Image, Text, View } from 'react-native';
import { styles } from '../../theme/styles';

export function Brand() {
  return (
    <View style={styles.brand}>
      <Image
        source={{ uri: 'https://i.ibb.co/vxP6Cs3c/logo.png' }}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.brandText}>vMTB</Text>
    </View>
  );
}
